import { AutoGroupingController } from "../src/background/controller";
import { TabSorter } from "../src/background/tab-sorter";

export default defineBackground(() => {
  const controller = new AutoGroupingController();
  const sorter = new TabSorter();

  // controllerとsorterを独立に起動する。片方の例外がもう片方の起動を止めないようにするため。
  void Promise.allSettled([controller.start(), sorter.start()]).then(
    ([controllerResult, sorterResult]) => {
      if (controllerResult.status === "rejected") {
        console.error("AutoGrouping controller failed to start", controllerResult.reason);
      }
      if (sorterResult.status === "rejected") {
        console.error("AutoGrouping tab sorter failed to start", sorterResult.reason);
      }
    },
  );
});
