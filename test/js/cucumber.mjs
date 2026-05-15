// Cucumber JS configuration
// Run from mindzoo/test/js with: npx cucumber-js

export default {
  paths: ["../features/**/*.feature"],
  require: ["./steps/**/*.js"],
  format: ["progress"],
  forceExit: true,
};
