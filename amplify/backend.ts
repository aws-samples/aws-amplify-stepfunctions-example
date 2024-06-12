import { defineBackend } from '@aws-amplify/backend';
import { data } from './data/resource';
import { CustomResources } from "./custom/customResources/resource";

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
    data,
});

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
