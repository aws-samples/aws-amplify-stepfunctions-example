import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/*=================================================================
The section below creates a Feedback database table with a "id", "content"
& "sentiment" fields. . The authorization rule below
specifies that any unauthenticated user can "create", "read", "update", 
and "delete" any "Feedback" records.
=========================================================================*/
const schema = a.schema({
  /*
    Creates a database table for 'Feedback' to store the feedbacks
    submitted through our web application.
  */
  Feedback: a
    .model({
      id: a.id(),
      content: a.string(),
      sentiment: a.string()
    })
    .authorization((allow) => [allow.publicApiKey()]),
  /*
    Create a new 'Execution' type that will be returned by our call
    to the Step Functions workflow.
  */
  Execution: a.customType({
    name: a.string(),
    status: a.string(),
    input: a.string(),
    executionArn: a.string(),
    startDate: a.string(),
    stopDate: a.string(),
    output: a.string(),
  }),
  /*
    Mutation that triggers the synchronous execution of our Step
    Functions workflow.
  */
  executeStateMachine: a
    .mutation()
    .arguments({input: a.string()})
    .returns(a.ref('Execution')),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'apiKey',
    apiKeyAuthorizationMode: { expiresInDays: 30 }
  },
});
