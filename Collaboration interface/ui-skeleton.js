export function showTableSkeleton(tbody, { rows = 6, cols = 6 } = {}) {
  if (!tbody) return;
  tbody.dataset.loading = "1";
  tbody.innerHTML = Array.from({ length: rows })
    .map(
      () => `
      <tr class="skeleton-row">
        ${Array.from({ length: cols })
          .map(() => `<td><span class="skeleton-line"></span></td>`)
          .join("")}
      </tr>
    `
    )
    .join("");
}

export function hideTableSkeleton(tbody) {
  if (!tbody || tbody.dataset.loading !== "1") return;
  delete tbody.dataset.loading;
  tbody.innerHTML = "";
}
