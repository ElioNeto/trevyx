// Package infra defines the trevyx cloud infrastructure resources.
//
// @Resource(type: "aws_s3_bucket", id: "uploads")
// @Provider(aws)
// @Tags(env: "production", app: "trevyx")
// @Output(bucket_arn)
// @Output(bucket_domain)
func defineStorage() {}

// @Resource(type: "aws_rds_instance", id: "database")
// @Provider(aws)
// @DependsOn(uploads)
// @Tags(env: "production", app: "trevyx")
// @Output(host)
// @Output(port)
// @Output(arn)
func defineDatabase() {}

// @Resource(type: "aws_instance", id: "app-server")
// @Provider(aws)
// @DependsOn(database)
// @Tags(env: "production", app: "trevyx")
// @Output(public_ip)
// @Output(private_ip)
func defineCompute() {}

// @Resource(type: "aws_sqs_queue", id: "task-queue")
// @Provider(aws)
// @Tags(env: "production", app: "trevyx")
// @Output(queue_arn)
// @Output(queue_url)
func defineQueue() {}
