"""
MFI (Money Flow Index): Calculation and Application Demo
=========================================================

Demonstrates:
  1. Complete MFI calculation from scratch
  2. RSI calculation for comparison
  3. Signal generation: overbought/oversold, divergence, MFI+ADX combo
  4. Visualization with multi-panel charts
"""

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import sys
sys.path.insert(0, "/workspace")
from adx_demo import compute_adx

# ============================================================
# 1. MFI Calculation
# ============================================================

def compute_mfi(high, low, close, volume, period=14):
    """
    Compute Money Flow Index.

    Parameters
    ----------
    high, low, close : array-like
        OHLC price data.
    volume : array-like
        Volume data.
    period : int
        Lookback period (default 14).

    Returns
    -------
    dict with keys: TP, RMF, PMF, NMF, MFR, MFI
    """
    h = np.asarray(high, dtype=np.float64)
    l = np.asarray(low, dtype=np.float64)
    c = np.asarray(close, dtype=np.float64)
    v = np.asarray(volume, dtype=np.float64)
    n = len(h)

    tp = (h + l + c) / 3.0
    rmf = tp * v

    pos_flow = np.zeros(n)
    neg_flow = np.zeros(n)

    for i in range(1, n):
        if tp[i] > tp[i - 1]:
            pos_flow[i] = rmf[i]
        elif tp[i] < tp[i - 1]:
            neg_flow[i] = rmf[i]

    mfi = np.full(n, np.nan)

    for i in range(period, n):
        pmf = np.sum(pos_flow[i - period + 1 : i + 1])
        nmf = np.sum(neg_flow[i - period + 1 : i + 1])

        if nmf == 0:
            mfi[i] = 100.0
        elif pmf == 0:
            mfi[i] = 0.0
        else:
            mfr = pmf / nmf
            mfi[i] = 100.0 - 100.0 / (1.0 + mfr)

    return {
        'TP': tp,
        'RMF': rmf,
        'MFI': mfi,
    }


# ============================================================
# 2. RSI Calculation (for comparison)
# ============================================================

def compute_rsi(close, period=14):
    """Compute RSI using Wilder smoothing."""
    c = np.asarray(close, dtype=np.float64)
    n = len(c)
    delta = np.diff(c)

    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)

    rsi = np.full(n, np.nan)
    if n <= period:
        return rsi

    avg_gain = np.mean(gain[:period])
    avg_loss = np.mean(loss[:period])

    if avg_loss == 0:
        rsi[period] = 100.0
    else:
        rs = avg_gain / avg_loss
        rsi[period] = 100.0 - 100.0 / (1.0 + rs)

    for i in range(period, len(delta)):
        avg_gain = (avg_gain * (period - 1) + gain[i]) / period
        avg_loss = (avg_loss * (period - 1) + loss[i]) / period

        if avg_loss == 0:
            rsi[i + 1] = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi[i + 1] = 100.0 - 100.0 / (1.0 + rs)

    return rsi


# ============================================================
# 3. Synthetic OHLCV with Regimes
# ============================================================

def generate_ohlcv(n_days=800, seed=42):
    """
    Generate synthetic OHLCV with four phases:
      [0, 200)   - sideways (moderate volume)
      [200, 400) - uptrend with increasing volume (bubble-like)
      [400, 500) - crash with spike volume
      [500, 800) - recovery + sideways
    """
    rng = np.random.default_rng(seed)
    close = np.zeros(n_days)
    high = np.zeros(n_days)
    low = np.zeros(n_days)
    volume = np.zeros(n_days)
    close[0] = 100.0

    for i in range(1, n_days):
        if i < 200:
            drift = 0.0
            vol = 0.8
            base_volume = 1e6
        elif i < 400:
            progress = (i - 200) / 200.0
            drift = 0.15 + 0.25 * progress
            vol = 0.6 + 0.5 * progress
            base_volume = 1e6 * (1 + 2 * progress)
        elif i < 500:
            progress = (i - 400) / 100.0
            drift = -0.6
            vol = 1.5 + progress
            base_volume = 3e6 * (1 + progress)
        else:
            progress = (i - 500) / 300.0
            drift = 0.05
            vol = 0.7
            base_volume = 1e6 * (1 - 0.3 * progress)

        ret = drift + rng.normal(0, vol)
        close[i] = close[i - 1] + ret
        close[i] = max(close[i], 10)

        intra = abs(rng.normal(0, vol * 0.6))
        if ret >= 0:
            high[i] = max(close[i - 1], close[i]) + abs(rng.normal(0, vol * 0.3))
            low[i] = min(close[i - 1], close[i]) - intra * 0.3
        else:
            high[i] = max(close[i - 1], close[i]) + intra * 0.3
            low[i] = min(close[i - 1], close[i]) - abs(rng.normal(0, vol * 0.3))

        low[i] = min(low[i], min(close[i - 1], close[i]))
        high[i] = max(high[i], max(close[i - 1], close[i]))
        volume[i] = max(base_volume * rng.lognormal(0, 0.4), 1e4)

    high[0] = close[0] + 0.5
    low[0] = close[0] - 0.5
    volume[0] = 1e6

    return high, low, close, volume


# ============================================================
# 4. Signal Generation
# ============================================================

def detect_divergence(price, mfi, lookback=30, min_gap=5):
    """
    Detect bullish and bearish divergences between price and MFI.

    Returns arrays of +1 (bullish divergence), -1 (bearish divergence), 0 (none).
    """
    n = len(price)
    div_signal = np.zeros(n)

    for i in range(lookback + min_gap, n):
        window_p = price[i - lookback:i + 1]
        window_m = mfi[i - lookback:i + 1]

        if np.any(np.isnan(window_m)):
            continue

        p_min_idx = np.argmin(window_p)
        p_max_idx = np.argmax(window_p)

        # Bullish divergence: price at new low, MFI not at new low
        if p_min_idx > lookback - min_gap:
            prev_p_min = np.min(window_p[:p_min_idx - min_gap + 1])
            if window_p[p_min_idx] <= prev_p_min:
                prev_m_at_p_low = window_m[np.argmin(window_p[:p_min_idx - min_gap + 1])]
                curr_m = window_m[p_min_idx]
                if curr_m > prev_m_at_p_low + 3:
                    div_signal[i] = 1

        # Bearish divergence: price at new high, MFI not at new high
        if p_max_idx > lookback - min_gap:
            prev_p_max = np.max(window_p[:p_max_idx - min_gap + 1])
            if window_p[p_max_idx] >= prev_p_max:
                prev_m_at_p_high = window_m[np.argmax(window_p[:p_max_idx - min_gap + 1])]
                curr_m = window_m[p_max_idx]
                if curr_m < prev_m_at_p_high - 3:
                    div_signal[i] = -1

    return div_signal


def generate_mfi_signals(mfi, adx, plus_di, minus_di,
                          ob_level=80, os_level=20, adx_threshold=25):
    """
    Generate combined MFI + ADX signals.

    - Range mode (ADX < threshold): MFI overbought/oversold
    - Trend mode (ADX > threshold): MFI pullback entry
    """
    n = len(mfi)
    signals = np.zeros(n, dtype=int)
    position = 0

    for i in range(1, n):
        if np.isnan(mfi[i]) or adx[i] == 0:
            signals[i] = position
            continue

        in_trend = adx[i] > adx_threshold

        if not in_trend:
            # Range mode
            if mfi[i - 1] < os_level and mfi[i] >= os_level:
                position = 1
            elif mfi[i - 1] > ob_level and mfi[i] <= ob_level:
                position = -1
            elif position == 1 and mfi[i] > 70:
                position = 0
            elif position == -1 and mfi[i] < 30:
                position = 0
        else:
            # Trend mode: pullback entries
            if plus_di[i] > minus_di[i]:
                if mfi[i - 1] < 35 and mfi[i] >= 35:
                    position = 1
                elif mfi[i] > 75:
                    position = 0
            elif minus_di[i] > plus_di[i]:
                if mfi[i - 1] > 65 and mfi[i] <= 65:
                    position = -1
                elif mfi[i] < 25:
                    position = 0

        signals[i] = position

    return signals


# ============================================================
# 5. Main Demo
# ============================================================

def main():
    print("=" * 60)
    print("MFI (Money Flow Index): Calculation & Application Demo")
    print("=" * 60)

    high, low, close, volume = generate_ohlcv(n_days=800)
    n = len(close)
    days = np.arange(n)

    # --- Compute indicators ---
    mfi_data = compute_mfi(high, low, close, volume, period=14)
    mfi = mfi_data['MFI']
    rsi = compute_rsi(close, period=14)
    adx_data = compute_adx(high, low, close, period=14)
    adx = adx_data['ADX']
    pdi = adx_data['+DI']
    mdi = adx_data['-DI']

    # --- Divergence detection ---
    div_signal = detect_divergence(close, mfi, lookback=30, min_gap=5)

    # --- Strategy signals ---
    signals = generate_mfi_signals(mfi, adx, pdi, mdi)

    # --- Per-phase statistics ---
    phases = [
        ("Sideways (0~200)", 0, 200),
        ("Uptrend/Bubble (200~400)", 200, 400),
        ("Crash (400~500)", 400, 500),
        ("Recovery (500~800)", 500, 800),
    ]

    for name, s, e in phases:
        start = max(s, 14)
        m_vals = mfi[start:e]
        r_vals = rsi[start:e]
        valid_m = m_vals[~np.isnan(m_vals)]
        valid_r = r_vals[~np.isnan(r_vals)]

        print(f"\n--- {name} ---")
        if len(valid_m) > 0:
            print(f"  MFI: mean={np.mean(valid_m):.1f}, "
                  f"min={np.min(valid_m):.1f}, max={np.max(valid_m):.1f}")
        if len(valid_r) > 0:
            print(f"  RSI: mean={np.mean(valid_r):.1f}, "
                  f"min={np.min(valid_r):.1f}, max={np.max(valid_r):.1f}")
        adx_vals = adx[start:e]
        adx_valid = adx_vals[adx_vals > 0]
        if len(adx_valid) > 0:
            print(f"  ADX: mean={np.mean(adx_valid):.1f}")

        bull_div = np.sum(div_signal[s:e] == 1)
        bear_div = np.sum(div_signal[s:e] == -1)
        print(f"  Divergences: bullish={bull_div}, bearish={bear_div}")

    # --- Strategy PnL ---
    strat_returns = signals[:-1] * np.diff(close)
    cum_pnl = np.cumsum(strat_returns)
    buy_hold_pnl = np.cumsum(np.diff(close))

    n_trades = np.sum(np.abs(np.diff(signals)) > 0)
    print(f"\n--- Strategy Performance (MFI + ADX) ---")
    print(f"  Signal changes: {n_trades}")
    print(f"  Strategy PnL:   {cum_pnl[-1]:.2f}")
    print(f"  Buy & Hold PnL: {buy_hold_pnl[-1]:.2f}")

    # --- MFI vs RSI disagreement analysis ---
    both_valid = ~np.isnan(mfi) & ~np.isnan(rsi)
    rsi_ob_mfi_not = np.sum((rsi > 70) & (mfi < 80) & both_valid)
    mfi_ob_rsi_not = np.sum((mfi > 80) & (rsi < 70) & both_valid)
    both_ob = np.sum((rsi > 70) & (mfi > 80) & both_valid)
    both_os = np.sum((rsi < 30) & (mfi < 20) & both_valid)

    print(f"\n--- MFI vs RSI Disagreement ---")
    print(f"  RSI overbought but MFI not: {rsi_ob_mfi_not} days "
          f"(price up without volume support)")
    print(f"  MFI overbought but RSI not: {mfi_ob_rsi_not} days "
          f"(volume surge without matching price)")
    print(f"  Both overbought:  {both_ob} days (strong confirmation)")
    print(f"  Both oversold:    {both_os} days (strong confirmation)")

    # ============================
    # PLOT
    # ============================
    fig, axes = plt.subplots(6, 1, figsize=(16, 22), sharex=True,
                              gridspec_kw={'height_ratios': [3, 1.5, 2, 2, 1.5, 2]})

    # Panel 1: Price + signals
    axes[0].plot(days, close, 'k-', linewidth=0.7, label='Close')
    long_m = signals == 1
    short_m = signals == -1
    axes[0].fill_between(days, close.min(), close.max(), where=long_m,
                         alpha=0.08, color='green', label='Long')
    axes[0].fill_between(days, close.min(), close.max(), where=short_m,
                         alpha=0.08, color='red', label='Short')

    bull_div_days = np.where(div_signal == 1)[0]
    bear_div_days = np.where(div_signal == -1)[0]
    axes[0].scatter(bull_div_days, close[bull_div_days], marker='^', color='lime',
                    s=40, zorder=5, label='Bullish Div')
    axes[0].scatter(bear_div_days, close[bear_div_days], marker='v', color='magenta',
                    s=40, zorder=5, label='Bearish Div')

    for x in [200, 400, 500]:
        axes[0].axvline(x, color='gray', linestyle='--', alpha=0.3)
    axes[0].text(100, close.max() * 0.97, 'Sideways', ha='center', fontsize=9, color='blue')
    axes[0].text(300, close.max() * 0.97, 'Uptrend', ha='center', fontsize=9, color='blue')
    axes[0].text(450, close.max() * 0.97, 'Crash', ha='center', fontsize=9, color='red')
    axes[0].text(650, close.max() * 0.97, 'Recovery', ha='center', fontsize=9, color='blue')
    axes[0].set_ylabel('Price')
    axes[0].set_title('Price with MFI+ADX Strategy Signals & Divergences')
    axes[0].legend(loc='upper left', fontsize=7, ncol=3)
    axes[0].grid(True, alpha=0.3)

    # Panel 2: Volume
    colors = ['green' if close[i] >= close[max(0, i-1)] else 'red' for i in range(n)]
    axes[1].bar(days, volume, color=colors, alpha=0.5, width=1.0)
    for x in [200, 400, 500]:
        axes[1].axvline(x, color='gray', linestyle='--', alpha=0.3)
    axes[1].set_ylabel('Volume')
    axes[1].set_title('Volume')
    axes[1].grid(True, alpha=0.3)

    # Panel 3: MFI
    valid_mfi = np.where(~np.isnan(mfi))[0]
    axes[2].plot(valid_mfi, mfi[valid_mfi], 'b-', linewidth=0.8, label='MFI(14)')
    axes[2].axhline(80, color='red', linestyle='--', linewidth=0.7, label='Overbought (80)')
    axes[2].axhline(20, color='green', linestyle='--', linewidth=0.7, label='Oversold (20)')
    axes[2].axhline(50, color='gray', linestyle=':', linewidth=0.5)
    axes[2].fill_between(valid_mfi, 80, mfi[valid_mfi],
                         where=mfi[valid_mfi] > 80, alpha=0.3, color='red')
    axes[2].fill_between(valid_mfi, mfi[valid_mfi], 20,
                         where=mfi[valid_mfi] < 20, alpha=0.3, color='green')
    for x in [200, 400, 500]:
        axes[2].axvline(x, color='gray', linestyle='--', alpha=0.3)
    axes[2].set_ylabel('MFI')
    axes[2].set_title('Money Flow Index (MFI)')
    axes[2].set_ylim(-5, 105)
    axes[2].legend(loc='upper left', fontsize=7)
    axes[2].grid(True, alpha=0.3)

    # Panel 4: RSI (for comparison)
    valid_rsi = np.where(~np.isnan(rsi))[0]
    axes[3].plot(valid_rsi, rsi[valid_rsi], color='purple', linewidth=0.8, label='RSI(14)')
    axes[3].axhline(70, color='red', linestyle='--', linewidth=0.7, label='Overbought (70)')
    axes[3].axhline(30, color='green', linestyle='--', linewidth=0.7, label='Oversold (30)')
    axes[3].axhline(50, color='gray', linestyle=':', linewidth=0.5)
    axes[3].fill_between(valid_rsi, 70, rsi[valid_rsi],
                         where=rsi[valid_rsi] > 70, alpha=0.3, color='red')
    axes[3].fill_between(valid_rsi, rsi[valid_rsi], 30,
                         where=rsi[valid_rsi] < 30, alpha=0.3, color='green')
    for x in [200, 400, 500]:
        axes[3].axvline(x, color='gray', linestyle='--', alpha=0.3)
    axes[3].set_ylabel('RSI')
    axes[3].set_title('RSI (for Comparison — No Volume)')
    axes[3].set_ylim(-5, 105)
    axes[3].legend(loc='upper left', fontsize=7)
    axes[3].grid(True, alpha=0.3)

    # Panel 5: ADX
    axes[4].plot(days, adx, 'b-', linewidth=1.0, label='ADX')
    axes[4].plot(days, pdi, 'g-', linewidth=0.6, alpha=0.6, label='+DI')
    axes[4].plot(days, mdi, 'r-', linewidth=0.6, alpha=0.6, label='-DI')
    axes[4].axhline(25, color='orange', linestyle='--', linewidth=0.7)
    for x in [200, 400, 500]:
        axes[4].axvline(x, color='gray', linestyle='--', alpha=0.3)
    axes[4].set_ylabel('ADX / DI')
    axes[4].set_title('ADX (Trend Filter for MFI)')
    axes[4].set_ylim(0, 60)
    axes[4].legend(loc='upper left', fontsize=7)
    axes[4].grid(True, alpha=0.3)

    # Panel 6: Cumulative PnL
    axes[5].plot(days[1:], cum_pnl, 'b-', linewidth=1.0, label='MFI+ADX Strategy')
    axes[5].plot(days[1:], buy_hold_pnl, 'k--', linewidth=0.7, alpha=0.5, label='Buy & Hold')
    axes[5].axhline(0, color='gray', linewidth=0.5)
    for x in [200, 400, 500]:
        axes[5].axvline(x, color='gray', linestyle='--', alpha=0.3)
    axes[5].set_ylabel('Cumulative PnL')
    axes[5].set_xlabel('Trading Day')
    axes[5].set_title('Strategy Performance: MFI+ADX vs Buy & Hold')
    axes[5].legend(loc='upper left', fontsize=8)
    axes[5].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig('mfi_demo.png', dpi=150)
    plt.close()
    print(f"\nPlot saved to mfi_demo.png")

    # --- Summary ---
    print("\n" + "=" * 60)
    print("KEY OBSERVATIONS")
    print("=" * 60)
    print("""
1. MFI 计算:
   TP = (H+L+C)/3 → RMF = TP×Vol → 分类正/负 → 14期求和 → MFI

2. MFI vs RSI 的差异:
   - 上涨趋势中: MFI 通常更早触及超买 (因为放量上涨时资金流更极端)
   - 崩盘时: MFI 更快到达超卖 (恐慌性放量卖出)
   - 横盘缩量时: MFI 更接近 50 (量小时资金流信号弱)

3. 量价背离:
   - RSI 显示超买但 MFI 不超买 → 缩量上涨，不可持续
   - MFI 和 RSI 同时超买 → 最可靠的反转信号

4. MFI + ADX 组合:
   - ADX < 25 (震荡): 使用 MFI 超买/超卖做反转
   - ADX > 25 (趋势): 使用 MFI 回调做顺势入场
""")


if __name__ == "__main__":
    main()
