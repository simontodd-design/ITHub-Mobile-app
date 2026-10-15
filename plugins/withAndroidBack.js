const { withMainActivity } = require('@expo/config-plugins');

/**
 * The edge swipe is Android's back gesture. On the root tabs there is nothing
 * to pop, and Android 14+ finishes the activity unless something handles it.
 * Forward that gesture into React and do not close the app when it falls through.
 */
function withAndroidBack(config) {
  return withMainActivity(config, (config) => {
    if (config.modResults.language !== 'kt') {
      return config;
    }

    let contents = config.modResults.contents;

    if (!contents.includes('OnBackPressedCallback')) {
      contents = contents.replace(
        'import android.os.Bundle\n',
        'import android.os.Bundle\n\nimport androidx.activity.OnBackPressedCallback\n',
      );

      contents = contents.replace(
        'super.onCreate(null)\n',
        `super.onCreate(null)

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        isEnabled = false
        onBackPressed()
        isEnabled = true
      }
    })
`,
      );
    }

    contents = contents.replace(
      /override fun invokeDefaultOnBackPressed\(\) \{[\s\S]*?\n  \}/,
      'override fun invokeDefaultOnBackPressed() {}',
    );
    contents = contents.replace('import android.os.Build\n', '');

    config.modResults.contents = contents;

    return config;
  });
}

module.exports = withAndroidBack;
