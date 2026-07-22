// Expo config plugin: withGoogleAdsKotlinFix
//
// react-native-google-mobile-ads@16.4.0 pulls in
// `com.google.android.gms:play-services-ads:25.4.0`, whose classes are compiled
// with Kotlin 2.3.0 metadata. Expo SDK 54 compiles the project with Kotlin
// 2.1.20, and a 2.1.x compiler refuses to read 2.3.0 metadata:
//
//   e: ...play-services-ads-25.4.0-api.jar!/META-INF/....kotlin_module
//      Module was compiled with an incompatible version of Kotlin.
//      The binary version of its metadata is 2.3.0, expected version is 2.1.0.
//      Task :react-native-google-mobile-ads:compileReleaseKotlin FAILED
//
// `-Xskip-metadata-version-check` tells the Kotlin compiler to read the newer
// metadata anyway. It only relaxes a compile-time check; the compiled bytecode
// (and therefore runtime behavior) is unchanged.
//
// android/ is git-ignored (managed / CNG workflow), so EAS regenerates it from
// config plugins on every build — this must live in a plugin, not a hand-edit.

const { withProjectBuildGradle } = require('@expo/config-plugins');

const MARKER = '// >>> withGoogleAdsKotlinFix';

const SNIPPET = `
${MARKER}
// Allow the Kotlin 2.1.20 compiler to read play-services-ads' Kotlin 2.3.0
// metadata (pulled in by react-native-google-mobile-ads). Compile-time only.
allprojects {
    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
        compilerOptions {
            freeCompilerArgs.add("-Xskip-metadata-version-check")
        }
    }
}
// <<< withGoogleAdsKotlinFix
`;

module.exports = function withGoogleAdsKotlinFix(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(
        "withGoogleAdsKotlinFix: expected the root build.gradle to be Groovy, " +
          `got '${config.modResults.language}'. Update this plugin.`
      );
    }
    if (!config.modResults.contents.includes(MARKER)) {
      config.modResults.contents = config.modResults.contents.trimEnd() + '\n' + SNIPPET;
    }
    return config;
  });
};
