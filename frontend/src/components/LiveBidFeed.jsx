export default function LiveBidFeed({ activeAuction, currentTeam }) {
  if (!activeAuction) return null;
  const bids = activeAuction.bidsHistory || [];

  return (
    <div className="stage-right">
      <div className="feed-topbar">
        <div className="feed-title">
          <span className="feed-live-dot" />
          Live Feed
        </div>
        <span className="feed-count">{bids.length} bids</span>
      </div>

      <div className="feed-list">
        {bids.map((b, idx) => {
          const isMe = currentTeam && (b.bidderId === currentTeam.teamId || b.bidderName === currentTeam.name);
          const isLatest = idx === 0;
          const isStart = b.type === "start";

          let rowClass = "feed-row";
          if (isStart) rowClass += " start-row";
          else if (isMe) rowClass += " my-bid";
          else if (isLatest) rowClass += " new-bid";

          return (
            <div key={idx} className={rowClass}>
              <div className="feed-row-top">
                <span className="feed-bidder">
                  {isStart ? "🔨 Auction opened" : b.bidderName}
                  {isMe && !isStart && <span className="you-tag">YOU</span>}
                  {isLatest && !isStart && !isMe && <span className="lead-tag">LEADING</span>}
                </span>
                <span className="feed-amt">₹{Number(b.amount || 0).toLocaleString()}</span>
              </div>
              {b.outbidName && (
                <div className="feed-sub" style={{ color: "var(--red)" }}>↑ Outbid {b.outbidName}</div>
              )}
              {b.text && !b.outbidName && <div className="feed-sub">{b.text}</div>}
              <div className="feed-time">
                {b.timestamp ? new Date(b.timestamp).toLocaleTimeString() : "Live"}
              </div>
            </div>
          );
        })}

        {bids.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 12px", color: "var(--ink4)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💤</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Waiting for first bid…</div>
          </div>
        )}
      </div>
    </div>
  );
}
