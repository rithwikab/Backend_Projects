const cron = require("node-cron");
const runReconciliation = require("./reconcile.job");

module.exports = () => {

  cron.schedule("0 */6 * * *", () => {
    runReconciliation();
  });

};
