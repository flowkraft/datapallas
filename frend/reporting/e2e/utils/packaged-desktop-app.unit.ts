import { expect, test } from '@playwright/test';
import * as http from 'http';
import { AddressInfo } from 'net';

import { isAppWindowUrl, MainProcessInspector, mainProcessExpression } from './packaged-desktop-app';

// The parts of PackagedDesktopApp that need no Windows and no DataPallas.exe: which page is the app's window, and the
// main process's evaluate, here against a stand-in inspector that answers Runtime.evaluate as Node's does.
// Run: PORTABLE_EXECUTABLE_DIR=. E2E_SPEC='packaged-desktop-app\.unit\.ts' npx playwright test --config e2e/playwright.config.ts
const { wsServer: WebSocketServer } = require('playwright-core/lib/utilsBundle');

const fakeElectron = { app: { getName: () => 'DataPallas' }, shell: {} as any };
const fakeRequire = (name: string) => {
  if (name !== 'electron') throw new Error(`no module ${name}`);
  return fakeElectron;
};

/** A stand-in for Node's inspector: /json/list, then Runtime.evaluate run here with `require` = fakeRequire. */
async function standInInspector(): Promise<{ port: number; close: () => void }> {
  const server = http.createServer((req, res) => {
    const { port } = server.address() as AddressInfo;
    res.end(JSON.stringify([{ webSocketDebuggerUrl: `ws://127.0.0.1:${port}/main` }]));
  });
  const sockets = new WebSocketServer({ server });
  sockets.on('connection', (socket: any) =>
    socket.on('message', async (data: Buffer) => {
      const { id, params } = JSON.parse(String(data));
      try {
        const value = await new Function('require', `return ${params.expression}`)(fakeRequire);
        socket.send(JSON.stringify({ id, result: { result: { value } } }));
      } catch (err) {
        socket.send(JSON.stringify({ id, result: { exceptionDetails: { text: 'Uncaught', exception: { description: String(err) } } } }));
      }
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { port: (server.address() as AddressInfo).port, close: () => { sockets.close(); server.close(); } };
}

test('the app window is index.html, not the splash', () => {
  expect(isAppWindowUrl('file:///C:/Users/x/AppData/Local/Temp/2abc/resources/app.asar/index.html')).toBe(true);
  expect(isAppWindowUrl('file:///C:/tmp/resources/app.asar/index.html#/processing')).toBe(true);
  expect(isAppWindowUrl('file:///C:/tmp/resources/app.asar/splash.html')).toBe(false);
  expect(isAppWindowUrl('about:blank')).toBe(false);
  expect(isAppWindowUrl('')).toBe(false);
});

test('the main process evaluates fn(electron, arg), as ElectronApplication.evaluate does', async () => {
  const expression = mainProcessExpression(({ app }: any, arg: any) => `${app.getName()} ${arg.n + 1}`, { n: 41 });
  expect(await new Function('require', `return ${expression}`)(fakeRequire)).toBe('DataPallas 42');
});

test('evaluate over the inspector: values, promises, the stub a spec installs, and errors', async () => {
  const inspector = await standInInspector();
  try {
    const main = await MainProcessInspector.connect(inspector.port, Date.now() + 10_000);
    expect(await main.evaluate(({ app }: any) => app.getName())).toBe('DataPallas');
    expect(await main.evaluate(async (_: any, arg: any) => arg * 2, 21)).toBe(42);
    await main.evaluate(({ shell }: any) => { shell.openExternal = async () => 'stubbed'; });
    expect(await fakeElectron.shell.openExternal('https://example.com')).toBe('stubbed');
    await expect(main.evaluate(() => { throw new Error('boom'); })).rejects.toThrow(/main process: Error: boom/);
    main.close();
  } finally {
    inspector.close();
  }
});

test('connect gives up at the deadline when nothing answers', async () => {
  await expect(MainProcessInspector.connect(1, Date.now() + 100)).rejects.toThrow(/inspector on port 1 never answered/);
});
