import type { ThemeConfig } from 'antd'

/** Kivonex account panel palette (the same as Kivonex Admin). styles.css repeats these as CSS variables for the custom parts. */
export const colors = {
  brand: '#4f46e5',
  brandSoft: '#eef2ff',
  ink: '#101828',
  body: '#344054',
  muted: '#667085',
  line: '#eaecf0',
  canvas: '#f5f6f8',
  surface: '#ffffff',
  success: '#079455',
  warning: '#dc6803',
  danger: '#d92d20'
}

export const theme: ThemeConfig = {
  token: {
    colorPrimary: colors.brand,
    colorInfo: colors.brand,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.danger,
    colorText: colors.ink,
    colorTextSecondary: colors.muted,
    colorBorder: '#d0d5dd',
    colorBorderSecondary: colors.line,
    colorBgLayout: colors.canvas,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 14,
    borderRadius: 8,
    borderRadiusLG: 12,
    controlHeight: 36,
    boxShadowTertiary: '0 1px 2px rgba(16, 24, 40, 0.05)'
  },
  components: {
    Layout: { bodyBg: colors.canvas, headerBg: colors.surface, siderBg: '#0c1222', headerHeight: 64, headerPadding: '0 28px' },
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(129, 140, 248, 0.16)',
      darkItemSelectedColor: '#ffffff',
      darkItemColor: '#a4abbd',
      darkItemHoverColor: '#ffffff',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.05)',
      darkGroupTitleColor: '#5d6478',
      itemHeight: 40,
      itemBorderRadius: 8,
      itemMarginInline: 12,
      iconSize: 16
    },
    Table: {
      headerBg: '#f9fafb',
      headerColor: colors.muted,
      headerSplitColor: 'transparent',
      rowHoverBg: '#f9fafb',
      cellPaddingBlock: 14,
      cellPaddingInline: 16,
      borderColor: colors.line
    },
    Card: { headerFontSize: 15, headerHeight: 56, paddingLG: 22 },
    Button: { fontWeight: 500, primaryShadow: 'none', defaultShadow: 'none', dangerShadow: 'none' },
    Tag: { defaultBg: '#f2f4f7', defaultColor: colors.body },
    Drawer: { paddingLG: 24 },
    Modal: { titleFontSize: 17, borderRadiusLG: 14 },
    Dropdown: { borderRadiusLG: 12, controlItemBgHover: '#f5f6f8' },
    Input: { activeShadow: '0 0 0 3px rgba(79, 70, 229, 0.12)' },
    Segmented: { itemSelectedBg: colors.surface, trackBg: '#f2f4f7' }
  }
}
