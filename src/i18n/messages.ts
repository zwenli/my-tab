/**
 * 文案字典的公共类型。
 *
 * 键名使用点分层级，例如 `'group.restoreAll'`，通过 `t('group.restoreAll')` 访问。
 */
export type Messages = Record<string, string>
