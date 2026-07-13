import { AutoGroupingController } from "../src/background/controller";

export default defineBackground(() => {
  const controller = new AutoGroupingController();
  void controller.start().catch((error: unknown) => {
    console.error("AutoGrouping failed to start", error);
  });
});
