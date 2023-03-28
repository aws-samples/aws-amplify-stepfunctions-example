import * as cdk from "aws-cdk-lib";
import * as AmplifyHelpers from "@aws-amplify/cli-extensibility-helper";
import { AmplifyDependentResourcesAttributes } from "../../types/amplify-dependent-resources-ref";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

const START_EXECUTION_REQUEST_TEMPLATE = (stateMachineArn: String) => {
  return `
  {
    "version": "2018-05-29",
    "method": "POST",
    "resourcePath": "/",
    "params": {
      "headers": {
        "content-type": "application/x-amz-json-1.0",
        "x-amz-target":"AWSStepFunctions.StartSyncExecution"
      },
      "body": {
        "stateMachineArn": "${stateMachineArn}",
        "input": "{ \\\"input\\\": \\\"$context.args.input\\\"}"
      }
    }
  }
`;
};

const RESPONSE_TEMPLATE = `
## Raise a GraphQL field error in case of a datasource invocation error
#if($ctx.error)
  $util.error($ctx.error.message, $ctx.error.type)
#end
## if the response status code is not 200, then return an error. Else return the body **
#if($ctx.result.statusCode == 200)
    ## If response is 200, return the body.
  $ctx.result.body
#else
    ## If response is not 200, append the response to error block.
    $utils.appendError($ctx.result.body, $ctx.result.statusCode)
#end
`;

export class cdkStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props?: cdk.StackProps,
    amplifyResourceProps?: AmplifyHelpers.AmplifyResourceProps
  ) {
    super(scope, id, props);
    /* Do not remove - Amplify CLI automatically injects the current deployment environment in this input parameter */
    new cdk.CfnParameter(this, "env", {
      type: "String",
      description: "Current Amplify CLI env name",
    });

    // All CDK resources we define as part of this walkthrough will go here.

    // Defines the existing GraphQL API as a dependency for the custom resource CDK stack
    const dependencies: AmplifyDependentResourcesAttributes =
      AmplifyHelpers.addResourceDependency(
        this,
        amplifyResourceProps.category,
        amplifyResourceProps.resourceName,
        [
          {
            category: "api",
            resourceName: "amplifysfn", // <- Adjust with name of your API resource
          },
        ]
      );

    // Get the ID of the existing GraphQL API
    const apiId = cdk.Fn.ref(
      dependencies.api.amplifysfn.GraphQLAPIIdOutput // <- Adjust with name of your API resource
    );

    // References the existing API via its ID
    const api = appsync.GraphqlApi.fromGraphqlApiAttributes(this, "API", {
      graphqlApiId: apiId,
    });

    // Adds the AWS Step Functions (SFN) service endpoint as a new HTTP data source to the GraphQL API
    const httpdatasource = api.addHttpDataSource(
      "ds",
      "https://sync-states." + cdk.Stack.of(this).region + ".amazonaws.com",
      {
        name: "HTTPDataSourceWithSFN",
        authorizationConfig: {
          signingRegion: cdk.Stack.of(this).region,
          signingServiceName: "states",
        },
      }
    );

    /*
    Defines the first task in our SFN workflow.
    We call the Amazon Comprehend detectSentiment API with 
    the input provided with the SFN execution.
    */
    const detect_sentiment_task = new tasks.CallAwsService(
      this,
      "Detect feedback sentiment",
      {
        service: "comprehend",
        action: "detectSentiment",
        iamResources: ["*"],
        iamAction: "comprehend:DetectSentiment",
        parameters: { "Text.$": "$.input", LanguageCode: "en" },
        resultPath: "$.DetectSentiment",
      }
    );

    // Get the name of the current Amplify environment (e.g., "dev", "prod")
    const envName = AmplifyHelpers.getProjectInfo().envName;

    // Import the DynamoDB table created by Amplify as a result of the @model directive in our GraphQL schema
    const feedbackTable = dynamodb.Table.fromTableName(
      this,
      "FeedbackTable",
      "Feedback-" + apiId + "-" + envName
    );

    // Save feedback and detected sentiment to DynamoDB table
    const save_to_ddb = new tasks.DynamoPutItem(
      this,
      "Record feedback and sentiment",
      {
        item: {
          id: tasks.DynamoAttributeValue.fromString(
            sfn.JsonPath.stringAt("$$.Execution.Id")
          ),
          __typename: tasks.DynamoAttributeValue.fromString("Feedback"),
          createdAt: tasks.DynamoAttributeValue.fromString(
            sfn.JsonPath.stringAt("$$.State.EnteredTime")
          ),
          updatedAt: tasks.DynamoAttributeValue.fromString(
            sfn.JsonPath.stringAt("$$.State.EnteredTime")
          ),
          content: tasks.DynamoAttributeValue.fromString(
            sfn.JsonPath.stringAt("$.input")
          ),
          sentiment: tasks.DynamoAttributeValue.fromString(
            sfn.JsonPath.stringAt("$.DetectSentiment.Sentiment")
          ),
        },
        table: feedbackTable,
        resultPath: sfn.JsonPath.DISCARD,
      }
    );


    // Creates an Amazon SNS topic to which we'll later publish notifications from our SFN workflow
    const customer_support_topic = new sns.Topic(
      this,
      "Customer support SNS topic"
    );

    /* Creates a subscription to the topic defined above using our own email 
    address. Make sure to replace this with an actual email address you have 
    access to.
    */
    customer_support_topic.addSubscription(
      new subs.EmailSubscription("email@example.com") // <- replace with your email
    );

    /*
    Defines a SFN task that publishs a notification 
    containing the sentiment detected by Amazon Rekognition to 
    the SNS topic we defined above.
    */
    const handleNonPositiveResult = new tasks.SnsPublish(
      this,
      "Notify customer support",
      {
        topic: customer_support_topic,
        message: sfn.TaskInput.fromObject({
          Message: "Non-positive feedback detected.",
          "Detected sentiment": sfn.JsonPath.stringAt(
            "$.DetectSentiment.Sentiment"
          ),
        }),
      }
    );

    // Defines a pass state that outputs that a negative sentiment was detected
    const nonPositiveResult = new sfn.Pass(
      this,
      "Non-positive feedback received",
      {
        result: sfn.Result.fromObject({ Sentiment: "NON-POSITIVE" }),
      }
    );

    // Defines what state the workflow moves to after the handleNonPositiveResult state
    handleNonPositiveResult.next(nonPositiveResult);

    // Defines a pass state that outputs that a positive sentiment was detected
    const positiveResult = new sfn.Pass(this, "Positive feedback received", {
      result: sfn.Result.fromObject({ Sentiment: "POSITIVE" }),
    });

    // Defines a Choice state
    const sentiment_choice = new sfn.Choice(
      this,
      "Positive or non-positive sentiment?"
    );

    // Defines what happens if our Choice state receives a positive sentiment
    sentiment_choice.when(
      sfn.Condition.stringEquals("$.DetectSentiment.Sentiment", "POSITIVE"),
      positiveResult
    );

    // Defines what happens if our Choice state receives anything other than a positive sentiment
    sentiment_choice.otherwise(handleNonPositiveResult);


    // The state machine definition brings together all our defined tasks
    const stateMachineDefinition = detect_sentiment_task
      .next(save_to_ddb)
      .next(sentiment_choice);

    // Create a service role for SFN to use
    const serviceRole = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal(
        "states." + cdk.Stack.of(this).region + ".amazonaws.com"
      ),
    });

    /* 
    Defines the express SFN workflow resource using the state 
    machine definition as well as the service role defined above.
    */
    const stateMachine = new sfn.StateMachine(this, "SyncStateMachine", {
      definition: stateMachineDefinition,
      stateMachineType: sfn.StateMachineType.EXPRESS,
      role: serviceRole,
    });

    // Grant AppSync HTTP data source rights to execute the SFN workflow
    stateMachine.grant(
      httpdatasource.grantPrincipal,
      "states:StartSyncExecution"
    );

    // Creates an IAM role that can be assumed by the AWS AppSync service
    const appsyncStepFunctionsRole = new iam.Role(
      this,
      "SyncStateMachineRole",
      {
        assumedBy: new iam.ServicePrincipal("appsync.amazonaws.com"),
      }
    );

    // Allows the role we defined above to execute express SFN workflows
    appsyncStepFunctionsRole.addToPolicy(
      new iam.PolicyStatement({
        resources: [stateMachine.stateMachineArn],
        actions: ["states:StartSyncExecution"],
      })
    );


    /*
    Adds a GraphQL resolver to our HTTP data source that defines how 
    GraphQL requests and fetches information from our SFN workflow.
    */
    httpdatasource.createResolver("execute-state-machine", {
      typeName: "Mutation",
      fieldName: "executeStateMachine",
      requestMappingTemplate: appsync.MappingTemplate.fromString(
        START_EXECUTION_REQUEST_TEMPLATE(stateMachine.stateMachineArn)
      ),
      responseMappingTemplate:
        appsync.MappingTemplate.fromString(RESPONSE_TEMPLATE),
    });
  }
}
