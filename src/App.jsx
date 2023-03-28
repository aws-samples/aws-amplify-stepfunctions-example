import React, { useState } from "react";
import {
  Flex,
  Heading,
  Text,
  Icon,
  TextAreaField,
  Button,
  Alert,
  Link,
  View,
} from "@aws-amplify/ui-react";
import { RiFeedbackLine } from "react-icons/ri";
import { Amplify, API } from "aws-amplify";
import { executeStateMachine } from "./graphql/mutations";
import awsExports from "./aws-exports";
Amplify.configure(awsExports);

function App() {
  const [feedback, setFeedback] = useState("");
  const [feedbackState, setFeedbackState] = useState("form");

  async function handleSubmit(event) {
    event.preventDefault();

    console.log("Feedback: ", feedback);

    const res_sfn = await API.graphql({
      query: executeStateMachine,
      variables: { input: feedback },
      authMode: "API_KEY",
    });

    const output = JSON.parse(res_sfn.data.executeStateMachine.output);

    setFeedbackState(output.Sentiment);

    setFeedback("");
  }

  return (
    <Flex
      direction="column"
      justifyContent="space-between"
      alignItems="center"
      alignContent="center"
      wrap="nowrap"
      gap="1rem"
    >
      <Text fontSize="6em">
        <Icon ariaLabel="Feedback" as={RiFeedbackLine} />
      </Text>
      <Heading level="4">We value your feedback!</Heading>
      {(() => {
        switch (feedbackState) {
          case "form":
            return (
              <>
                <Text>
                  Please share your feedback to help us improve our services.
                </Text>
                <Flex
                  as="form"
                  direction="column"
                  width="20rem"
                  onSubmit={handleSubmit}
                >
                  <TextAreaField
                    type="email"
                    isRequired={true}
                    onChange={(event) => setFeedback(event.target.value)}
                    value={feedback}
                  />
                  <Button type="submit">Submit</Button>
                </Flex>
              </>
            );
          case "POSITIVE":
            return (
              <View width="35rem">
                <Alert
                  variation="success"
                  isDismissible={false}
                  hasIcon={true}
                  heading="Thank you!"
                >
                  Your feedback has been recorded.
                </Alert>
              </View>
            );
          default:
            return (
              <View width="35rem">
                <Alert
                  variation="info"
                  isDismissible={false}
                  hasIcon={true}
                  heading="Thank you for your feedback!"
                >
                  We are always looking to improve. If you felt your experience
                  was not optimal, we would love to make things right. Follow{" "}
                  <Link
                    href="https://docs.amplify.aws/"
                    textDecoration="underline dotted"
                    isExternal={true}
                  >
                    this link
                  </Link>{" "}
                  to get in touch with a customer service representative.
                </Alert>
              </View>
            );
        }
      })()}
    </Flex>
  );
}

export default App;
