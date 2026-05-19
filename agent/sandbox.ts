import {
  defineSandbox,
  vercelBackend,
  type SandboxDefinition,
  type VercelSandboxBootstrapUseOptions,
  type VercelSandboxSessionUseOptions,
} from "experimental-ash/sandbox";

const sandbox: SandboxDefinition<
  VercelSandboxBootstrapUseOptions,
  VercelSandboxSessionUseOptions
> = defineSandbox({
  backend: vercelBackend(),
});

export default sandbox;
