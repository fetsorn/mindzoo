import { After } from "@cucumber/cucumber";

After(function () {
  this.cleanup();
});
