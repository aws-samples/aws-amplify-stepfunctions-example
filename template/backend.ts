import { defineBackend } from '@aws-amplify/backend';
import { data } from './data/resource';
import { CustomResources } from "./custom/customResources/resource";

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
    data,
});

const customResources = new CustomResources(
    backend.createStack('customResources'),
    'customResources',
    {
        data: {
            apiId: backend.data.apiId,
        },
        notification: {
            emailAddress: "YOUR_EMAIL_ID"
        }
    }
);

backend.addOutput({
    custom: {
        apiId: backend.data.apiId,
        apiKey: backend.data.apiKey,
        url: backend.data.graphqlUrl,
    },
});

