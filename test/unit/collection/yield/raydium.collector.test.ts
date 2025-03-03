import { RaydiumCollector } from "@defi";

describe("Testing RaydiumCollector", () => {
  it("should return 400 if trade state parameter is not defined", async () => {
    const collector = new RaydiumCollector([
      {
        id: "raydium-58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
        collector: "raydium",
        enabled: true,
      },
    ]);
    const response = await collector.collect();
    expect(response.length).toBe(1);
  });
});
