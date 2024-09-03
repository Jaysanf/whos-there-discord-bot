import dotenv from "dotenv";
dotenv.config();
import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export interface DiscordCommandStackProps extends StackProps {
  queueName?: string;
  discordPublicKey: string;
  discordApplicationId: string;
  discordBotToken: string;
}

export class DiscordCommandStack extends Stack {
  constructor(scope: Construct, id: string, props: DiscordCommandStackProps) {
    super(scope, id, props);

    if (!props.queueName) {
      props.queueName = 'DiscordCommandQueue';
    }

    // Create SQS queue
    const queue = new sqs.Queue(this, 'DiscordCommandQueue', {
      queueName: props.queueName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const environment = {
      QUEUE_URL: queue.queueUrl,
      DISCORD_PUBLIC_KEY: props.discordPublicKey,
      DISCORD_APPLICATION_ID: props.discordApplicationId,
      DISCORD_BOT_TOKEN: props.discordBotToken,
    };

    const allowGetParameter = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${this.region}:${this.account}:parameter${props.discordPublicKey}`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter${props.discordApplicationId}`,
        `arn:aws:ssm:${this.region}:${this.account}:parameter${props.discordBotToken}`,
      ],
    });

    // Create Lambda function for handling HTTP
    const httpLambdaFunction = new lambda.Function(this, 'DiscordCommandHttpFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromDockerBuild('.'), // Replace with your Lambda function code path
      handler: 'index.lambdaHandler', // Replace with your Lambda function handler file path
      timeout: cdk.Duration.seconds(30),
      environment,
      memorySize: 2048,
    });

    // Grant permissions to the Lambda function to access the SSM Parameter Store secure string
    httpLambdaFunction.addToRolePolicy(allowGetParameter);

    const api = new apigateway.RestApi(this, 'DiscordCommandApi', {
      restApiName: 'DiscordCommandApi',
      description: 'This service serves Discord commands.',
    });

    const integration = new apigateway.LambdaIntegration(httpLambdaFunction, {
      proxy: true,
      requestTemplates: {
        'application/json': '{ "statusCode": "200" }',
      },
    });

    const apiResource = api.root.addResource('discord');
    apiResource.addMethod('POST', integration);

    // Create Lambda function for handling Async commands
    const asyncLambdaFunction = new lambda.Function(this, 'DiscordCommandAsyncFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromDockerBuild('.'), // Replace with your Lambda function code path
      handler: 'index.asyncHandler', // Replace with your Lambda function handler file path
      timeout: cdk.Duration.seconds(30),
      environment,
    });

    // Grant permissions to the Lambda function to access the SSM Parameter Store secure string
    asyncLambdaFunction.addToRolePolicy(allowGetParameter);

    // Grant permissions to the Lambda function to access the SQS queue
    queue.grantConsumeMessages(asyncLambdaFunction);
    asyncLambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [queue.queueArn],
        actions: ['sqs:DeleteMessage'],
      })
    );

    // Grant permission for HTTP Lambda function to add to the SQS queue
    queue.grantSendMessages(httpLambdaFunction);
    httpLambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [queue.queueArn],
        actions: ['sqs:GetQueueAttributes'],
      })
    );

    // Set up trigger for Lambda function to consume messages from the SQS queue
    const eventSource = new SqsEventSource(queue, {
      batchSize: 1,
    });
    asyncLambdaFunction.addEventSource(eventSource);

    const ec2 = this.createDiscordEC2(this);

    const guildUserTable = new dynamodb.Table(this, 'GuildUser', {
      partitionKey: { name: 'guildId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      tableName: 'GuildUser', // Optional: specify a custom table name
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // Optional: specify billing mode
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    guildUserTable.grantFullAccess(ec2);
    guildUserTable.grantFullAccess(httpLambdaFunction);
    guildUserTable.grantFullAccess(asyncLambdaFunction);

  }

  createDiscordEC2(scope: Construct) : ec2.Instance {
    const vpc = new ec2.Vpc(scope, 'DiscordVPC', {
      maxAzs: 2,
    });

    const securityGroup = new ec2.SecurityGroup(scope, 'DiscordEC2SecurityGroup', {
      vpc,
      description: 'Allow HTTP and SSH traffic to EC2 instance',
      allowAllOutbound: true,
    });

    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'Allow HTTP traffic');
    securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Allow SSH traffic');


    // Create the EC2 instance
    const instance = new ec2.Instance(scope, 'DiscordEC2Instance', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      vpc,
      securityGroup,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,// Ensure it's a public subnet
      },
      keyName: "discord-bot-ec2",
    });

    // User data script to set up the EC2 instance
    instance.addUserData(
      `#!/bin/bash`,
      `sudo yum update -y`,
      `sudo yum install -y git nodejs npm`,
      // Export environment variables and add them to .bashrc for persistence
      `echo "export DISCORD_BOT_TOKEN=${process.env.DISCORD_BOT_TOKEN}" | sudo tee -a /home/ec2-user/.bashrc`,
      `echo "export AWS_REGION=us-east-1" | sudo tee -a /home/ec2-user/.bashrc`,

      // Reload the .bashrc to apply the environment variables immediately
      `source /home/ec2-user/.bashrc`,

      // Output the variables to confirm they are set
      'echo $DISCORD_BOT_TOKEN',
      'echo $AWS_REGION',

      `git clone https://github.com/Jaysanf/whos-there-discord-bot.git /home/ec2-user/whos-there-discord-bot`,
      'cd /home/ec2-user/whos-there-discord-bot',
      'echo "DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}" | sudo tee .env > /dev/null',
      'cat .env',
      `sudo npm install`,
      `sudo npm run deploy:discordLoop`
    );

    return instance;
  }
}
