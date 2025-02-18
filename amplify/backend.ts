import { defineBackend } from '@aws-amplify/backend';
import { data } from './data/resource';
import { CustomResources } from "./custom/customResources/resource";

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
    data,
});

// Patch the generated AppSync SDL to add the @aws_api_key directive to the executeStateMachine mutation
// unsure why Amplify is not adding it, and we don't want to define a custom Lambda resolver for this
const { cfnResources } = backend.data.resources;
cfnResources.cfnGraphqlSchema.definition = cfnResources.cfnGraphqlSchema.definition?.replace(
    'executeStateMachine(input: String): Execution\n\t\t@aws_iam',
    'executeStateMachine(input: String): Execution\n\t\t@aws_iam @aws_api_key'
);

new CustomResources(
    backend.createStack('customResources'),
    'customResources',
    {
        data: {
            apiId: backend.data.apiId,
        },
        notification: {
            emailAddress: "hello@email.com" // Fill in your email address
        }
    }
);
