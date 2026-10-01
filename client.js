// dph-emotion-arc 客户端半部：composer dock 情绪状态芯片 + 可展开面板
// 数据经 Host 的只读 HTTP 端点获取；写操作仅通过 Agent 工具（可审计）。
window.__ModuleLoader__.load({
  id: 'dph-emotion-arc',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const ZH = { joy: '开心', anger: '愤怒', sadness: '低落', fear: '害怕', surprise: '惊讶', disgust: '厌恶', neutral: '平静' };
    const EMOJI = { joy: '😄', anger: '😠', sadness: '😢', fear: '😨', surprise: '😲', disgust: '🤢', neutral: '😌' };
    // 情绪色为内容/艺术色（非 chrome 色），主题 token 只用于容器与文字
    const COLORS = { joy: '#e8a33d', anger: '#d9534f', sadness: '#5b8dd9', fear: '#9b6bc9', surprise: '#4db6ac', disgust: '#8d9b6a', neutral: '#8a8f98' };
    const KIND_ZH = { conflict: '冲突', reconciliation: '和解', soothe: '安抚', breakthrough: '突破', preference: '偏好', milestone: '里程碑', other: '其他' };

    const CSS = `
.dph-ea-wrap { max-width: 100%; }
.dph-ea-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 12px; line-height: 1.4;
  color: var(--dsw-alias-label-secondary);
  padding: 4px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  cursor: pointer; user-select: none;
  max-width: 100%;
}
.dph-ea-chip:hover { border-color: var(--dsw-alias-border-l2); }
.dph-ea-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.dph-ea-name { font-weight: 550; color: var(--dsw-alias-label-primary); white-space: nowrap; }
.dph-ea-meter { display: inline-flex; gap: 2px; align-items: flex-end; }
.dph-ea-seg { width: 3px; height: 9px; border-radius: 1px; background: var(--dsw-alias-state-idle-primary); opacity: .35; }
.dph-ea-seg.dph-ea-on { opacity: 1; }
.dph-ea-time { opacity: .75; white-space: nowrap; }
.dph-ea-panel {
  margin-top: 6px; padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  font-size: 12px; line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
  max-width: 100%;
}
.dph-ea-panel h4 { margin: 8px 0 2px; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dph-ea-panel h4:first-child { margin-top: 0; }
.dph-ea-row { padding: 3px 0; word-break: break-all; }
.dph-ea-empty { opacity: .7; }
`;

    function relTime(iso) {
      const t = Date.parse(iso);
      if (!Number.isFinite(t)) return '';
      const diff = Date.now() - t;
      if (diff < 60 * 1000) return '刚刚';
      if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`;
      if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`;
      return new Date(t).toLocaleDateString();
    }

    function Dock(props) {
      const sid = props && props.sessionId;
      const [open, setOpen] = React.useState(false);
      const [state, setState] = React.useState(null);
      const [ledger, setLedger] = React.useState([]);

      React.useEffect(() => {
        if (!sid) return;
        let stop = false;
        const tick = () => {
          fetch(`/api/dph-emotion-arc/state?sessionId=${encodeURIComponent(sid)}`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (!stop && j) setState(j); })
            .catch(() => {});
          fetch(`/api/dph-emotion-arc/ledger?sessionId=${encodeURIComponent(sid)}&limit=6`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : null))
            .then((j) => { if (!stop && j) setLedger(j.entries || []); })
            .catch(() => {});
        };
        tick();
        const timer = setInterval(tick, 4000);
        return () => { stop = true; clearInterval(timer); };
      }, [sid]);

      if (!sid) return null;

      const st = state && state.exists !== false ? state : null;
      const label = st && ZH[st.current] ? ZH[st.current] : '未初始化';
      const emoji = st && EMOJI[st.current] ? EMOJI[st.current] : '🎭';
      const color = st && COLORS[st.current] ? COLORS[st.current] : COLORS.neutral;
      const filled = st ? Math.round(Math.min(1, Math.max(0, st.intensity || 0)) * 5) : 0;
      const time = st && st.updatedAt ? relTime(st.updatedAt) : '';
      const toggle = () => setOpen((v) => !v);

      return h('div', { className: 'dph-ea-wrap' },
        h('div', {
          className: 'dph-ea-chip',
          role: 'button',
          tabIndex: 0,
          title: st && st.trigger ? `触发语："${st.trigger}"` : '情绪弧线导演 · 点击展开',
          onClick: toggle,
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } },
        },
          h('span', { className: 'dph-ea-dot', style: { background: color } }),
          h('span', { className: 'dph-ea-name' }, `${emoji} ${label}`),
          h('span', { className: 'dph-ea-meter', 'aria-hidden': true },
            Array.from({ length: 5 }, (_, i) => h('span', {
              key: i,
              className: `dph-ea-seg${i < filled ? ' dph-ea-on' : ''}`,
              style: i < filled ? { background: color } : undefined,
            })),
          ),
          h('span', { className: 'dph-ea-time' }, time),
        ),
        open ? h('div', { className: 'dph-ea-panel' },
          h('h4', {}, '情绪弧线 · 当前状态'),
          st
            ? h('div', { className: 'dph-ea-row' }, `${emoji} ${label} · 强度 ${(st.intensity || 0).toFixed(2)} · 置信 ${(st.confidence || 0).toFixed(2)}`)
            : h('div', { className: 'dph-ea-empty dph-ea-row' }, '暂无情绪状态记录（发送消息后自动开始识别）'),
          st && st.trigger ? h('div', { className: 'dph-ea-row' }, `触发语：${st.trigger}`) : null,
          st && st.history && st.history.length > 0 ? h('div', {},
            h('h4', {}, '变化历史'),
            st.history.slice(-5).reverse().map((it, i) => h('div', { key: i, className: 'dph-ea-row' },
              `${ZH[it.from] || it.from} → ${ZH[it.to] || it.to} · 强度 ${(it.intensity || 0).toFixed(2)} · ${relTime(new Date(it.ts).toISOString())}`)),
          ) : null,
          ledger && ledger.length > 0 ? h('div', {},
            h('h4', {}, '情绪记忆账本'),
            ledger.map((it, i) => h('div', { key: i, className: 'dph-ea-row' },
              `${KIND_ZH[it.kind] || it.kind}：${it.note}${it.effectiveness ? `（效果：${it.effectiveness}）` : ''} · ${relTime(new Date(it.ts).toISOString())}`)),
          ) : null,
        ) : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style');
        style.dataset.dphEmotionArc = '1';
        style.textContent = CSS;
        document.head.appendChild(style);
        const disposeSlots = ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register(
          { name: 'conversation.composer.dock', id: 'dph-emotion-arc', order: 10, label: '情绪弧线' },
          Dock,
        ));
        return () => {
          disposeSlots();
          style.remove();
        };
      },
    };
  },
});
