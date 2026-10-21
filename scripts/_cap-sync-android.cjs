// scripts/_cap-sync-android.cjs
// 临时同步脚本：Capacitor CLI 8.4.2 的 TS 配置 loader 读 ts.ModuleResolutionKind，
// 而本项目装的是 TypeScript 7（该枚举已移除），`cap sync` 于是在解析 capacitor.config.ts 时崩溃。
// 这里直接读等价的 capacitor.config.json，调用 CLI 自己的 copy / update 任务，
// 不改动仓库里任何配置或依赖。

const path = require('path');

(async () => {
  const { copyCommand } = require('@capacitor/cli/dist/tasks/copy');
  const { updateCommand } = require('@capacitor/cli/dist/tasks/update');

  const projectRoot = path.resolve(__dirname, '..');
  const extConfig = require('../capacitor.config.json');
  const projectPackage = require('../package.json');
  const cliPackage = require('@capacitor/cli/package.json');
  const webDir = extConfig.webDir;
  const androidPlatformDirAbs = path.resolve(projectRoot, 'android');

  // 复刻 loadConfig() 里 loadAndroidConfig / loadWebConfig 的产物：
  // copy 的 checkWebDir 读 app.extConfig.server，update 的 addUpdateChecks 读 platform.name。
  const config = {
    android: {
      name: 'android',
      platformDir: 'android',
      platformDirAbs: androidPlatformDirAbs,
      appDir: 'app',
      appDirAbs: path.resolve(androidPlatformDirAbs, 'app'),
      srcDir: 'app/src',
      srcDirAbs: path.resolve(androidPlatformDirAbs, 'app/src'),
      srcMainDir: 'app/src/main',
      srcMainDirAbs: path.resolve(androidPlatformDirAbs, 'app/src/main'),
      assetsDir: 'app/src/main/assets',
      assetsDirAbs: path.resolve(androidPlatformDirAbs, 'app/src/main/assets'),
      webDir: 'app/src/main/assets/public',
      webDirAbs: path.resolve(androidPlatformDirAbs, 'app/src/main/assets/public'),
      resDir: 'app/src/main/res',
      resDirAbs: path.resolve(androidPlatformDirAbs, 'app/src/main/res'),
      apkName: 'app-debug.apk',
      flavor: '',
      buildOptions: {},
      // update 的 removePluginsNativeFiles 要清这个目录。
      cordovaPluginsDir: 'capacitor-cordova-android-plugins',
      cordovaPluginsDirAbs: path.resolve(androidPlatformDirAbs, 'capacitor-cordova-android-plugins'),
      minVersion: '24',
    },
    web: { name: 'web', platformDir: webDir, platformDirAbs: path.resolve(projectRoot, webDir) },
    // copy / update 都会读 config.ios.name（判断当前平台是不是 iOS），即使只打安卓包也要给。
    ios: { name: 'ios', platformDir: 'ios', platformDirAbs: path.resolve(projectRoot, 'ios') },
    // removePluginsNativeFiles 要从 CLI 自带的 assets 里解包 cordova 插件模板。
    cli: {
      rootDir: projectRoot,
      assetsDir: 'assets',
      assetsDirAbs: path.resolve(projectRoot, 'node_modules', '@capacitor', 'cli', 'assets'),
      assets: {
        android: {
          platformTemplateArchive: 'android-template.tar.gz',
          cordovaPluginsTemplateArchive: 'capacitor-cordova-android-plugins.tar.gz',
          cordovaPluginsTemplateArchiveAbs: path.resolve(
            projectRoot, 'node_modules', '@capacitor', 'cli', 'assets',
            'capacitor-cordova-android-plugins.tar.gz',
          ),
        },
      },
      package: cliPackage,
    },
    app: {
      rootDir: projectRoot,
      appId: extConfig.appId,
      appName: extConfig.appName,
      webDir,
      webDirAbs: path.resolve(projectRoot, webDir),
      package: projectPackage,
      extConfig,
      extConfigName: 'capacitor.config.json',
      extConfigType: 'json',
    },
  };

  console.log('[sync] projectRoot:', projectRoot);
  console.log('[sync] webDir     :', webDir);

  await copyCommand(config, 'android', false);
  console.log('[sync] copy done');
  await updateCommand(config, 'android', false);
  console.log('[sync] update done');
})().catch(error => {
  console.error('[sync] failed:', error && error.message ? error.message : error);
  process.exit(1);
});
