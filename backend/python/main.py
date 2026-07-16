# Trevyx — Python worker: board analytics & stats
# Implements the vyx IPC protocol natively (stdlib only).

import json
import os
import socket
import struct
import sys

# ─── IPC Protocol Constants ────────────────────────────────────────────

TYPE_REQUEST = 0x01
TYPE_RESPONSE = 0x02
TYPE_HEARTBEAT = 0x03
TYPE_HANDSHAKE = 0x05

# ─── IPC Client ────────────────────────────────────────────────────────

def get_socket_path():
    """Get socket path from --vyx-socket CLI arg or VYX_SOCKET env."""
    for i, arg in enumerate(sys.argv):
        if arg == '--vyx-socket' and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return os.environ.get('VYX_SOCKET')


def write_frame(conn, msg_type, payload):
    """Write a binary frame: 4 bytes LE length + 1 byte type + JSON payload."""
    data = json.dumps(payload).encode('utf-8') if payload is not None else b''
    header = struct.pack('<I', len(data)) + bytes([msg_type])
    conn.sendall(header + data)


def read_frame(conn):
    """Read a complete frame from the socket. Returns (msg_type, payload_dict) or None."""
    header = b''
    while len(header) < 5:
        chunk = conn.recv(5 - len(header))
        if not chunk:
            return None
        header += chunk

    length = struct.unpack('<I', header[:4])[0]
    msg_type = header[4]

    payload = b''
    while len(payload) < length:
        chunk = conn.recv(length - len(payload))
        if not chunk:
            return None
        payload += chunk

    data = json.loads(payload.decode('utf-8')) if payload else None
    return msg_type, data


# ─── Handlers ──────────────────────────────────────────────────────────

DB_PATH = os.environ.get('TREVYX_DB_PATH',
    os.path.join(os.path.dirname(__file__), '..', 'node', 'trevyx.db'))


def handle_board_stats(board_id: str) -> dict:
    """Calculate board statistics from SQLite database."""
    import sqlite3

    if not os.path.exists(DB_PATH):
        return {
            'status_code': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': {'error': f'Database not found at {DB_PATH}'}
        }

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # Board info
        c.execute("SELECT id, title FROM boards WHERE id = ?", (board_id,))
        board = c.fetchone()
        if not board:
            conn.close()
            return {
                'status_code': 404,
                'body': {'error': 'Board not found'}
            }

        # Cards per list
        c.execute("""
            SELECT l.title, COUNT(c.id) as count
            FROM lists l LEFT JOIN cards c ON c.list_id = l.id
            WHERE l.board_id = ?
            GROUP BY l.id ORDER BY l.position
        """, (board_id,))
        cards_by_list = {row[0]: row[1] for row in c.fetchall()}

        # Cards by priority
        c.execute("""
            SELECT c.priority, COUNT(*) as count
            FROM cards c JOIN lists l ON c.list_id = l.id
            WHERE l.board_id = ?
            GROUP BY c.priority
        """, (board_id,))
        by_priority = {row[0]: row[1] for row in c.fetchall()}

        # Total counts
        c.execute("SELECT COUNT(*) FROM lists WHERE board_id = ?", (board_id,))
        total_lists = c.fetchone()[0]

        c.execute("""
            SELECT COUNT(*) FROM cards c
            JOIN lists l ON c.list_id = l.id WHERE l.board_id = ?
        """, (board_id,))
        total_cards = c.fetchone()[0]

        # Overdue
        c.execute("""
            SELECT COUNT(*) FROM cards c JOIN lists l ON c.list_id = l.id
            WHERE l.board_id = ? AND c.due_date IS NOT NULL
            AND c.due_date < date('now')
        """, (board_id,))
        overdue = c.fetchone()[0]

        conn.close()

        return {
            'status_code': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': {
                'board_id': board_id,
                'title': board['title'],
                'total_lists': total_lists,
                'total_cards': total_cards,
                'cards_by_list': cards_by_list,
                'cards_by_priority': by_priority,
                'overdue_cards': overdue,
                'completion_rate': round(
                    (total_cards - overdue) / max(total_cards, 1) * 100, 1
                ),
            }
        }
    except Exception as e:
        return {
            'status_code': 500,
            'body': {'error': str(e)}
        }


def handle_user_stats(user_id: str) -> dict:
    """Calculate user activity statistics."""
    import sqlite3

    if not os.path.exists(DB_PATH):
        return {'status_code': 500, 'body': {'error': 'DB not found'}}

    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()

        c.execute("SELECT COUNT(*) FROM boards WHERE user_id = ?", (user_id,))
        total_boards = c.fetchone()[0]

        c.execute("""
            SELECT COUNT(*) FROM cards c
            JOIN lists l ON c.list_id = l.id
            JOIN boards b ON l.board_id = b.id
            WHERE b.user_id = ?
        """, (user_id,))
        total_cards = c.fetchone()[0]

        conn.close()
        return {
            'status_code': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': {
                'user_id': user_id,
                'total_boards': total_boards,
                'total_cards': total_cards,
            }
        }
    except Exception as e:
        return {'status_code': 500, 'body': {'error': str(e)}}


# ─── Router ────────────────────────────────────────────────────────────

def match_path(url_path: str, pattern: str) -> bool:
    """Match URL path against a pattern with :params."""
    url_parts = url_path.strip('/').split('/')
    pat_parts = pattern.strip('/').split('/')
    if len(url_parts) != len(pat_parts):
        return False
    for p, u in zip(pat_parts, url_parts):
        if p.startswith(':'):
            continue
        if p != u:
            return False
    return True


def extract_param(url_path: str, pattern: str, param: str) -> str:
    """Extract a named parameter value from URL path."""
    url_parts = url_path.strip('/').split('/')
    pat_parts = pattern.strip('/').split('/')
    for p, u in zip(pat_parts, url_parts):
        if p == f':{param}':
            return u
    return ''


ROUTES = [
    ('GET', '/api/export/boards/:id/stats', lambda req, id: handle_board_stats(id)),
    ('GET', '/api/stats/boards/:id', lambda req, id: handle_board_stats(id)),
    ('GET', '/api/stats/user/:id', lambda req, id: handle_user_stats(id)),
]


def dispatch(req: dict) -> dict:
    """Route request to handler."""
    method = req.get('method', 'GET')
    path = req.get('path', '/')
    params = req.get('params', {})

    for route_method, route_path, handler in ROUTES:
        if route_method != method:
            continue
        # First check params (already matched by core), then direct match
        if match_path(path, route_path):
            param_id = params.get('id', extract_param(path, route_path, 'id'))
            return handler(req, param_id)

    return {
        'status_code': 404,
        'body': {'error': f'route not found: {method} {path}'}
    }


# ─── Main ──────────────────────────────────────────────────────────────

def main():
    socket_path = get_socket_path()
    if not socket_path:
        print("error: --vyx-socket argument required", file=sys.stderr)
        sys.exit(1)

    # Connect to core
    conn = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        conn.connect(socket_path)
    except Exception as e:
        print(f"error: connect to {socket_path}: {e}", file=sys.stderr)
        sys.exit(1)

    # Handshake
    handshake = {
        'type': 'handshake',
        'worker_id': 'python:stats',
        'capabilities': [
            {'path': '/api/stats/boards/:id', 'method': 'GET'},
            {'path': '/api/stats/user/:id', 'method': 'GET'},
            {'path': '/api/export/boards/:id/stats', 'method': 'GET'},
        ],
    }
    write_frame(conn, TYPE_HANDSHAKE, handshake)
    write_frame(conn, TYPE_HEARTBEAT, None)

    # Message loop
    while True:
        frame = read_frame(conn)
        if frame is None:
            break

        msg_type, payload = frame

        if msg_type == TYPE_HEARTBEAT:
            write_frame(conn, TYPE_HEARTBEAT, None)

        elif msg_type == TYPE_REQUEST:
            response = dispatch(payload)
            response['correlation_id'] = payload.get('correlation_id', '')
            write_frame(conn, TYPE_RESPONSE, response)

        # else: ignore unknown types

    conn.close()


if __name__ == '__main__':
    main()
