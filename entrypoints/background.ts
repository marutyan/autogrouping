import { AutoGroupingController } from "../src/background/controller";
import { TabSorter } from "../src/background/tab-sorter";

export default defineBackground(() => {
  const controller = new AutoGroupingController();
  const sorter = new TabSorter();

  void (async () => {
    await controller.start();
    await sorter.start();
  })().catch((error: unknown) => {
    console.error("AutoGrouping failed to start", error);
  });
});
