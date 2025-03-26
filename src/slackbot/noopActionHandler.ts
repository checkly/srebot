export const NOOP_ACTION_ID = "noop-action";

export const noopActionHandler = () => {
  return async ({ ack }) => {
    await ack();
  };
};
