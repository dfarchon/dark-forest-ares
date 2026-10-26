// Build the packages referenced by eth/tsconfig.ref.json without typechecking eth/.
// Hardhat compile needs those dist outputs, and it is also what writes
// packages/contracts/abis and typechain. eth/ itself is typechecked later.
const { spawnSync } = require('child_process');
const path = require('path');
const ts = require('typescript');

const configPath = path.join(__dirname, '../tsconfig.ref.json');
const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);

if (error) {
  console.error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  process.exit(1);
}

const projects = (config.references || []).map((ref) =>
  path.resolve(path.dirname(configPath), ref.path)
);

if (projects.length === 0) {
  console.error(`No project references in ${configPath}`);
  process.exit(1);
}

const result = spawnSync('tsc', ['--build', ...projects], {
  stdio: 'inherit',
  cwd: path.dirname(configPath),
});

process.exit(result.status === null ? 1 : result.status);
