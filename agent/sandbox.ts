import { defineSandbox, vercelBackend } from "experimental-ash/sandbox";

export default defineSandbox({
  backend: vercelBackend(),
});
