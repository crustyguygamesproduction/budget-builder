const NAV_ITEMS = [
  ["today", "Home"],
  ["upload", "Upload"],
  ["debts", "Debts"],
  ["investments", "Invest"],
  ["accounts", "Accounts"],
  ["calendar", "Cal"],
  ["goals", "Goals"],
  ["receipts", "Receipts"],
  ["coach", "AI"],
  ["settings", "More"],
];

export default function BottomNav({ page, setPage, screenWidth, styles }) {
  return (
    <nav style={getNavStyle(screenWidth, styles)}>
      {NAV_ITEMS.map((item) => {
        const isActive = page === item[0];

        return (
          <button
            key={item[0]}
            onClick={() => setPage(item[0])}
            style={{
              ...styles.navBtn,
              ...(isActive ? styles.navBtnActive : {}),
            }}
          >
            {item[1]}
          </button>
        );
      })}
    </nav>
  );
}

function getNavStyle(screenWidth, styles) {
  return {
    ...styles.nav,
    left: screenWidth <= 480 ? "8px" : "12px",
    right: screenWidth <= 480 ? "8px" : "12px",
    bottom: screenWidth <= 480 ? "8px" : "12px",
  };
}
