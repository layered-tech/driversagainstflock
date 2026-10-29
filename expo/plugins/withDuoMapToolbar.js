const { readFile, writeFile } = require('node:fs/promises');
const { createRequire } = require('node:module');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

const assignment = `  navitem.rightBarButtonItems = [config barButtonItemsFromConfigs:config.headerRightBarButtonItems
                                                 withCurrentItems:navitem.rightBarButtonItems];`;

const groupedAssignment = `  // DAF: Keep map manipulation in the navigation controller's managed toolbar.
  NSMutableArray<NSDictionary *> *dafHeaderConfigs = [NSMutableArray new];
  NSMutableArray<NSDictionary *> *dafToolbarConfigs = [NSMutableArray new];
  NSMutableArray<NSDictionary *> *dafOverflowConfigs = [NSMutableArray new];
  for (NSDictionary *item in config.headerRightBarButtonItems) {
    NSString *identifier = item[@"identifier"];
    if ([identifier hasPrefix:@"daf-map-toolbar:"]) {
      [dafToolbarConfigs addObject:item];
#if !TARGET_OS_TV && !TARGET_OS_VISION
    } else if ([identifier hasPrefix:@"daf-map-overflow:"]) {
      [dafOverflowConfigs addObject:item];
#endif
    } else {
      [dafHeaderConfigs addObject:item];
    }
  }
  navitem.rightBarButtonItems = [config barButtonItemsFromConfigs:dafHeaderConfigs
                                                 withCurrentItems:navitem.rightBarButtonItems];
  NSArray<UIBarButtonItem *> *dafToolbarItems = [config barButtonItemsFromConfigs:dafToolbarConfigs
                                                                            withCurrentItems:@[]];
  BOOL dafHadToolbar = NO;
  for (UIBarButtonItem *item in vc.toolbarItems) {
    if (@available(iOS 26.0, *)) {
      dafHadToolbar |= [item.identifier hasPrefix:@"daf-map-toolbar:"];
    }
  }
  if (dafToolbarItems.count > 0 || dafHadToolbar) {
    [vc setToolbarItems:dafToolbarItems animated:NO];
    [navctr setToolbarHidden:dafToolbarItems.count == 0 animated:NO];
  }
#if !TARGET_OS_TV && !TARGET_OS_VISION
  if (@available(iOS 16.0, *)) {
    NSMutableArray<UIMenuElement *> *dafOverflowActions = [NSMutableArray new];
    for (UIBarButtonItem *item in [config barButtonItemsFromConfigs:dafOverflowConfigs withCurrentItems:@[]]) {
      UIAction *action = [UIAction actionWithTitle:item.title ?: @"" image:item.image identifier:nil
                                         handler:^(__kindof UIAction *sender) {
        [UIApplication.sharedApplication sendAction:item.action to:item.target from:item forEvent:nil];
      }];
      action.attributes = item.enabled ? 0 : UIMenuElementAttributesDisabled;
      [dafOverflowActions addObject:action];
    }
    navitem.additionalOverflowItems = dafOverflowActions.count > 0
        ? [UIDeferredMenuElement elementWithProvider:^(void (^completion)(NSArray<UIMenuElement *> *)) {
            completion(dafOverflowActions);
          }]
        : nil;
  }
#endif`;

function groupDuoMapToolbar(source) {
    if (source.includes('// DAF: Keep map manipulation')) return source;
    if (!source.includes(assignment)) {
        throw new Error(
            '[with-duo-map-toolbar] Native header implementation changed.',
        );
    }
    const hidden = '  if (shouldHide) {\n    navitem.title = config.title;';
    if (!source.includes(hidden)) {
        throw new Error(
            '[with-duo-map-toolbar] Native header cleanup changed.',
        );
    }
    return source.replace(assignment, groupedAssignment).replace(
        hidden,
        `${hidden}
    // DAF: A modal host or empty action layer must also hide the map toolbar.
    for (UIBarButtonItem *item in vc.toolbarItems) {
      if (@available(iOS 26.0, *)) {
        if ([item.identifier hasPrefix:@"daf-map-toolbar:"]) {
          [vc setToolbarItems:nil animated:NO];
          [navctr setToolbarHidden:YES animated:NO];
          break;
        }
      }
    }`,
    );
}

async function patchDuoMapToolbar(projectRoot) {
    const projectRequire = createRequire(
        path.join(projectRoot, 'package.json'),
    );
    const root = path.dirname(
        projectRequire.resolve('react-native-screens/package.json'),
    );
    const target = path.join(root, 'ios/RNSScreenStackHeaderConfig.mm');
    const source = await readFile(target, 'utf8');
    const updated = groupDuoMapToolbar(source);
    if (source !== updated) await writeFile(target, updated);
}

module.exports = function withDuoMapToolbar(config) {
    return withDangerousMod(config, [
        'ios',
        async (mod) => {
            await patchDuoMapToolbar(mod.modRequest.projectRoot);
            return mod;
        },
    ]);
};
module.exports.groupDuoMapToolbar = groupDuoMapToolbar;
module.exports.patchDuoMapToolbar = patchDuoMapToolbar;
