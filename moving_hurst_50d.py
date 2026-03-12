"""
50-Day Moving Hurst Exponent on Daily Returns
==============================================

计算流程:
  1. 取日频收益率序列 r[0], r[1], ..., r[T-1]
  2. 在每个时刻 t (t >= window-1), 取过去 window 天的收益率窗口
  3. 对该窗口做 R/S 分析 (或 DFA), 得到当日的 Hurst 值
  4. 向前滑动 1 天, 重复

核心问题: 50 个样本点非常少, R/S 可用的尺度范围极其有限 (约 5~12),
         估计偏差大、方差高。下面展示三种方法并做对比。
"""

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ============================================================
# Method 1: 手写 R/S (适配小窗口)
# ============================================================
def hurst_rs_small(series, min_n=5, max_n=None):
    """
    R/S analysis tuned for short series (N=50~100).

    对小窗口做了两处适配:
      - min_n 降到 5 (默认 10 在 N=50 时尺度点太少)
      - 使用 overlapping segments 增加每个尺度的 R/S 样本量
    """
    x = np.asarray(series, dtype=np.float64)
    N = len(x)
    if max_n is None:
        max_n = N // 2

    log_n = []
    log_rs = []

    for n in range(min_n, max_n + 1):
        rs_list = []
        for start in range(0, N - n + 1):
            seg = x[start : start + n]
            m = seg.mean()
            devs = seg - m
            cum = np.cumsum(devs)
            R = cum.max() - cum.min()
            S = seg.std(ddof=1)
            if S > 1e-12:
                rs_list.append(R / S)
        if len(rs_list) >= 2:
            log_n.append(np.log(n))
            log_rs.append(np.log(np.mean(rs_list)))

    if len(log_n) < 3:
        return np.nan

    H, _ = np.polyfit(log_n, log_rs, 1)
    return float(np.clip(H, 0.0, 1.0))


# ============================================================
# Method 2: 手写简化 DFA-1 (适配小窗口)
# ============================================================
def hurst_dfa_small(series, min_box=4, max_box=None, num_scales=15):
    """
    Simplified DFA-1 for short windows.
    Returns the DFA exponent alpha, which for stationary increments
    (like returns) maps directly to H.
    """
    x = np.asarray(series, dtype=np.float64)
    N = len(x)
    if max_box is None:
        max_box = N // 2

    profile = np.cumsum(x - x.mean())

    boxes = np.unique(np.logspace(
        np.log10(min_box), np.log10(max_box), num=num_scales
    ).astype(int))
    boxes = boxes[(boxes >= min_box) & (boxes <= max_box)]

    log_s = []
    log_f = []

    for s in boxes:
        n_seg = N // s
        if n_seg < 1:
            continue
        var_list = []
        for i in range(n_seg):
            seg = profile[i * s : (i + 1) * s]
            t = np.arange(s, dtype=np.float64)
            coef = np.polyfit(t, seg, 1)
            trend = np.polyval(coef, t)
            var_list.append(np.mean((seg - trend) ** 2))
        if var_list:
            log_s.append(np.log(s))
            log_f.append(0.5 * np.log(np.mean(var_list)))

    if len(log_s) < 3:
        return np.nan

    alpha, _ = np.polyfit(log_s, log_f, 1)
    return float(np.clip(alpha, 0.0, 2.0))


# ============================================================
# Method 3: nolds library
# ============================================================
def hurst_nolds_rs(series):
    import nolds
    try:
        return nolds.hurst_rs(series, corrected=True, nvals=None)
    except Exception:
        return np.nan


# ============================================================
# Rolling Hurst calculator
# ============================================================
def rolling_hurst(returns, window=50, method="rs_small"):
    """
    Compute moving Hurst exponent.

    Parameters
    ----------
    returns : array-like
        Daily log-return series.
    window : int
        Lookback window in trading days.
    method : str
        "rs_small"  - hand-written R/S with overlapping segments
        "dfa_small" - hand-written DFA-1
        "nolds"     - nolds.hurst_rs with Anis-Lloyd-Peters correction

    Returns
    -------
    dates_idx : ndarray of int
        Index of the last day in each window (i.e., "as-of" date).
    h_values : ndarray of float
        Hurst exponent estimates.
    """
    r = np.asarray(returns, dtype=np.float64)
    N = len(r)

    func_map = {
        "rs_small": hurst_rs_small,
        "dfa_small": hurst_dfa_small,
        "nolds": hurst_nolds_rs,
    }
    func = func_map[method]

    idx_list = []
    h_list = []

    for end in range(window, N + 1):
        seg = r[end - window : end]
        h = func(seg)
        idx_list.append(end - 1)
        h_list.append(h)

    return np.array(idx_list), np.array(h_list)


# ============================================================
# Demo: synthetic data with regime changes
# ============================================================
def generate_regime_data(n_total=1000, seed=42):
    """
    Generate synthetic daily returns with three regimes:
      [0,   400) - trending  (persistent, H > 0.5)
      [400, 700) - mean-reverting (anti-persistent, H < 0.5)
      [700, 1000) - random walk (H ≈ 0.5)
    """
    rng = np.random.default_rng(seed)

    trending = np.empty(400)
    trending[0] = 0.0
    for i in range(1, 400):
        trending[i] = 0.6 * trending[i - 1] + rng.normal(0, 0.01)

    mean_rev = np.empty(300)
    mean_rev[0] = 0.0
    for i in range(1, 300):
        mean_rev[i] = -0.5 * mean_rev[i - 1] + rng.normal(0, 0.01)

    random_walk = rng.normal(0, 0.01, 300)

    returns = np.concatenate([trending, mean_rev, random_walk])
    return returns


def main():
    print("=" * 60)
    print("50-Day Moving Hurst Exponent - Demo")
    print("=" * 60)

    returns = generate_regime_data(n_total=1000, seed=42)
    window = 50

    # --- Compute with all three methods ---
    idx1, h1 = rolling_hurst(returns, window=window, method="rs_small")
    idx2, h2 = rolling_hurst(returns, window=window, method="dfa_small")
    idx3, h3 = rolling_hurst(returns, window=window, method="nolds")

    # --- Print summary statistics per regime ---
    regimes = [
        ("Trending (persistent)",     0,   400),
        ("Mean-reverting (anti-per)", 400, 700),
        ("Random walk",               700, 1000),
    ]

    for name, start, end in regimes:
        mask = (idx1 >= start + window - 1) & (idx1 < end)
        print(f"\n--- {name} [day {start}~{end}] ---")
        print(f"  R/S small : mean={np.nanmean(h1[mask]):.3f}  "
              f"std={np.nanstd(h1[mask]):.3f}")
        mask2 = (idx2 >= start + window - 1) & (idx2 < end)
        print(f"  DFA small : mean={np.nanmean(h2[mask2]):.3f}  "
              f"std={np.nanstd(h2[mask2]):.3f}")
        mask3 = (idx3 >= start + window - 1) & (idx3 < end)
        print(f"  nolds R/S : mean={np.nanmean(h3[mask3]):.3f}  "
              f"std={np.nanstd(h3[mask3]):.3f}")

    # --- Plot ---
    fig, axes = plt.subplots(3, 1, figsize=(14, 10), sharex=True)

    axes[0].plot(returns, linewidth=0.5, color="black")
    axes[0].set_ylabel("Daily Return")
    axes[0].set_title("Synthetic Returns with Regime Changes")
    axes[0].axvline(400, color="red", linestyle="--", alpha=0.5)
    axes[0].axvline(700, color="red", linestyle="--", alpha=0.5)
    axes[0].text(200, axes[0].get_ylim()[1] * 0.8, "Trending",
                 ha="center", fontsize=9, color="blue")
    axes[0].text(550, axes[0].get_ylim()[1] * 0.8, "Mean-Rev",
                 ha="center", fontsize=9, color="blue")
    axes[0].text(850, axes[0].get_ylim()[1] * 0.8, "Random",
                 ha="center", fontsize=9, color="blue")

    axes[1].plot(idx1, h1, linewidth=0.8, label="R/S (overlapping)", color="steelblue")
    axes[1].plot(idx3, h3, linewidth=0.8, label="nolds R/S (corrected)", color="orange", alpha=0.7)
    axes[1].axhline(0.5, color="gray", linestyle="--", linewidth=0.8)
    axes[1].axhline(0.55, color="green", linestyle=":", linewidth=0.6, alpha=0.5)
    axes[1].axhline(0.45, color="red", linestyle=":", linewidth=0.6, alpha=0.5)
    axes[1].axvline(400, color="red", linestyle="--", alpha=0.3)
    axes[1].axvline(700, color="red", linestyle="--", alpha=0.3)
    axes[1].set_ylabel("Hurst (R/S)")
    axes[1].set_ylim(0, 1)
    axes[1].legend(loc="upper right", fontsize=8)
    axes[1].set_title(f"50-Day Moving Hurst (R/S Methods)")

    axes[2].plot(idx2, h2, linewidth=0.8, label="DFA-1", color="darkgreen")
    axes[2].axhline(0.5, color="gray", linestyle="--", linewidth=0.8)
    axes[2].axhline(0.55, color="green", linestyle=":", linewidth=0.6, alpha=0.5)
    axes[2].axhline(0.45, color="red", linestyle=":", linewidth=0.6, alpha=0.5)
    axes[2].axvline(400, color="red", linestyle="--", alpha=0.3)
    axes[2].axvline(700, color="red", linestyle="--", alpha=0.3)
    axes[2].set_ylabel("Hurst (DFA)")
    axes[2].set_xlabel("Trading Day")
    axes[2].set_ylim(0, 1.5)
    axes[2].legend(loc="upper right", fontsize=8)
    axes[2].set_title(f"50-Day Moving Hurst (DFA)")

    plt.tight_layout()
    plt.savefig("moving_hurst_50d.png", dpi=150)
    plt.close()
    print(f"\nPlot saved to moving_hurst_50d.png")

    # --- Practical guidance ---
    print("\n" + "=" * 60)
    print("PRACTICAL NOTES FOR 50-DAY WINDOW")
    print("=" * 60)
    print("""
1. 50 个样本点是 Hurst 估计的下限, 结果方差很大。
   不要对单日的 H 值做决策, 应关注 H 的趋势方向。

2. R/S 方法在 N=50 时:
   - 非重叠分段: 尺度范围仅 [5, 12], 约 8 个回归点
   - 重叠分段 (本实现): 同样的尺度范围但每个尺度有更多样本,
     R/S 估计更稳定

3. DFA 在 N=50 时:
   - box size 范围 [4, 25], 约 10-15 个回归点
   - DFA 的 alpha 对 stationary increments (收益率) 直接等于 H
   - 但小样本下 alpha 偏差也不小

4. 实战建议:
   - 将 H 值做 5~10 日移动平均, 进一步平滑
   - 关注 H 的变化方向而非绝对值
   - 同时使用 R/S 和 DFA, 两者一致时信号更可靠
   - 如果可能, 用 100~200 日窗口替代 50 日窗口
""")


if __name__ == "__main__":
    main()
