import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'dark',
    themes: {
      dark: {
        colors: {
          primary: '#FF6B00',
          secondary: '#424242',
          accent: '#FF9500',
          error: '#FF5252',
          info: '#2196F3',
          success: '#4CAF50',
          warning: '#FFC107',
          'surface-elevated': '#242424',
          'surface-glass': '#1A1A1A',
        },
        variables: {
        'glow-rgb': '255, 107, 0',
        'glass-bg': 'rgba(26, 26, 26, 0.85)',
        'glass-border': 'rgba(255, 107, 0, 0.12)',
      },
      },
    },
  },
});
