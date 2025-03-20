import { createErrorPatternsBlock } from "./errorPatternBlock";

describe("errorPatternBlock", () => {
  it("renders empty error patterns", () => {
    const blocks = createErrorPatternsBlock([]);
    expect(blocks).toMatchSnapshot();
  });

  it("renders single error pattern", () => {
    const blocks = createErrorPatternsBlock([
      {
        id: "123",
        error_message: "Error Pattern #1\nDetails of error pattern #1",
        count: 10,
        first_seen_at: new Date(),
        last_seen_at: new Date(),
        embedding: [],
        embedding_model: "model",
        account_id: "account1",
      },
    ]);
    expect(blocks).toMatchSnapshot();
  });

  it("renders multiple error patterns", () => {
    const blocks = createErrorPatternsBlock([
      {
        id: "123",
        error_message: "Error Pattern #1\nDetails of error pattern #1",
        count: 10,
        first_seen_at: new Date(),
        last_seen_at: new Date(),
        embedding: [],
        embedding_model: "model",
        account_id: "account1",
      },
      {
        id: "124",
        error_message: "Error Pattern #2\nDetails of error pattern #2",
        count: 20,
        first_seen_at: new Date(),
        last_seen_at: new Date(),
        embedding: [],
        embedding_model: "model",
        account_id: "account2",
      },
    ]);
    expect(blocks).toMatchSnapshot();
  });
});
