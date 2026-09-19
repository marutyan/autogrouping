import type { GroupingRule } from "../../../src/core/types";
import { GROUP_COLOR_HEX } from "../../../src/ui/group-colors";
import { useDismissibleMenu } from "../hooks/useDismissibleMenu";

// AddSiteMenu コンポーネントのプロパティ型定義。
// アクティブタブURL、既存ルール一覧、新規追加ハンドラ、既存グループ追加ハンドラ、新規作成導線ハンドラを受け取る。
export interface AddSiteMenuProps {
  tabUrl: string | undefined;
  rules: readonly GroupingRule[];
  onAddGroup: () => void;
  onAddSiteToGroup: (rule: GroupingRule) => void;
  onNewGroupWithSite: () => void;
}

// ポップアップ下部のフッター操作と「Add this site…」ドロップダウンメニューを提供するコンポーネント。
// 新規グループ作成ボタン、および現在閲覧中のサイトを既存または新規グループへ素早く追加する導線を提示する。
export function AddSiteMenu({
  tabUrl,
  rules,
  onAddGroup,
  onAddSiteToGroup,
  onNewGroupWithSite,
}: AddSiteMenuProps) {
  const { isOpen, toggleMenu, closeMenu, containerRef } = useDismissibleMenu();

  const isHttp = tabUrl ? tabUrl.startsWith("http://") || tabUrl.startsWith("https://") : false;

  function handleSelectGroup(rule: GroupingRule) {
    closeMenu();
    onAddSiteToGroup(rule);
  }

  function handleNewGroupWithSite() {
    closeMenu();
    onNewGroupWithSite();
  }

  return (
    <footer className="popup-footer">
      <button type="button" className="primary-button" onClick={onAddGroup}>
        + New group
      </button>

      {isHttp && (
        <div className="add-site-container" ref={containerRef}>
          <button
            type="button"
            className="text-button add-site-trigger"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            onClick={toggleMenu}
          >
            Add this site…
          </button>

          {isOpen && (
            <div className="add-site-menu" role="menu" aria-label="Add this site">
              {rules.map((rule) => (
                <button
                  type="button"
                  key={rule.id}
                  role="menuitem"
                  className="add-site-menu-item"
                  onClick={() => handleSelectGroup(rule)}
                >
                  <span
                    className="color-dot"
                    style={{ backgroundColor: GROUP_COLOR_HEX[rule.color] }}
                    aria-hidden="true"
                  />
                  <span className="menu-item-name">{rule.name}</span>
                </button>
              ))}
              {rules.length > 0 && <hr className="menu-separator" />}
              <button
                type="button"
                role="menuitem"
                className="add-site-menu-item new-group-item"
                onClick={handleNewGroupWithSite}
              >
                + New group with this site
              </button>
            </div>
          )}
        </div>
      )}
    </footer>
  );
}
