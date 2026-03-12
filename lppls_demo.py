"""
LPPLS Signal Analysis Demo
===========================

Demonstrates:
  1. Generating synthetic bubble data with LPPLS dynamics
  2. Fitting the LPPLS model (single fit)
  3. Computing the multi-scale confidence indicator
  4. Visualization of results
"""

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.optimize import minimize
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings("ignore")

# ============================================================
# 1. LPPLS Model Core
# ============================================================

def lppls_func(t, tc, m, w, a, b, c1, c2):
    dt = np.abs(tc - t) + 1e-8
    return a + np.power(dt, m) * (
        b + c1 * np.cos(w * np.log(dt)) + c2 * np.sin(w * np.log(dt))
    )


def solve_linear_params(t, price, tc, m, w):
    """Solve A, B, c1, c2 analytically given tc, m, w."""
    dt = np.abs(tc - t) + 1e-8
    fi = np.power(dt, m)
    gi = fi * np.cos(w * np.log(dt))
    hi = fi * np.sin(w * np.log(dt))

    X = np.column_stack([np.ones_like(t), fi, gi, hi])
    XtX = X.T @ X + 1e-8 * np.eye(4)
    Xty = X.T @ price
    return np.linalg.solve(XtX, Xty)


def lppls_objective(x, t, price):
    tc, m, w = x
    if tc <= t[-1] or m <= 0 or m >= 1 or w < 2 or w > 15:
        return 1e12
    a, b, c1, c2 = solve_linear_params(t, price, tc, m, w)
    fitted = lppls_func(t, tc, m, w, a, b, c1, c2)
    return np.sum((price - fitted) ** 2)


def fit_lppls(t, price, max_searches=25):
    t1, t2 = t[0], t[-1]
    best_sse = np.inf
    best_params = None

    for _ in range(max_searches):
        tc0 = np.random.uniform(t2, t2 + 0.3 * (t2 - t1))
        m0 = np.random.uniform(0.1, 0.9)
        w0 = np.random.uniform(6.0, 13.0)

        try:
            result = minimize(
                lppls_objective, x0=[tc0, m0, w0],
                args=(t, price), method='Nelder-Mead',
                options={'maxiter': 5000, 'xatol': 1e-8, 'fatol': 1e-8}
            )
            if result.success and result.fun < best_sse:
                best_sse = result.fun
                tc, m, w = result.x
                a, b, c1, c2 = solve_linear_params(t, price, tc, m, w)
                c = np.sqrt(c1**2 + c2**2)
                best_params = {
                    'tc': tc, 'm': m, 'w': w,
                    'a': a, 'b': b, 'c': c, 'c1': c1, 'c2': c2,
                    'sse': result.fun,
                }
        except Exception:
            continue

    return best_params


def get_oscillations(w, tc, t1, t2):
    if tc <= t2 or tc <= t1:
        return 0.0
    return (w / (2 * np.pi)) * np.log((tc - t1) / (tc - t2))


def get_damping(m, w, b, c):
    if w == 0 or c == 0:
        return 0.0
    return (m * abs(b)) / (w * abs(c))


def check_filter(params, t1, t2):
    """Check if a fit passes the standard LPPLS filter conditions."""
    tc = params['tc']
    m = params['m']
    w = params['w']
    b = params['b']
    c = params['c']

    dt = t2 - t1
    tc_in_range = max(t2 - 60, t2 - 0.5 * dt) < tc < min(t2 + 252, t2 + 0.5 * dt)
    m_in_range = 0 < m < 1
    w_in_range = 2 < w < 15
    O = get_oscillations(w, tc, t1, t2)
    D = get_damping(m, w, b, c)
    O_ok = O > 2.5
    D_ok = D > 0.5

    return tc_in_range and m_in_range and w_in_range and O_ok and D_ok


# ============================================================
# 2. Multi-Scale Confidence Indicator
# ============================================================

def compute_confidence_indicator(t, price, window_max=120, window_min=30,
                                  outer_step=5, inner_step=5, max_searches=15):
    """
    Compute LPPLS confidence indicator via nested multi-scale fitting.

    Returns arrays aligned to the t2 endpoints.
    """
    N = len(t)
    results = []

    for end_idx in range(window_max, N + 1, outer_step):
        t2_val = t[end_idx - 1]
        p2_val = price[end_idx - 1]

        pos_count = 0
        neg_count = 0
        pos_qual = 0
        neg_qual = 0

        start_idx_base = end_idx - window_max

        for win_shrink in range(0, window_max - window_min, inner_step):
            start_idx = start_idx_base + win_shrink
            if start_idx < 0 or start_idx >= end_idx - 10:
                continue

            t_seg = t[start_idx:end_idx]
            p_seg = price[start_idx:end_idx]

            params = fit_lppls(t_seg, p_seg, max_searches=max_searches)
            if params is None:
                continue

            b = params['b']
            qualified = check_filter(params, t_seg[0], t_seg[-1])

            if b < 0:
                pos_count += 1
                if qualified:
                    pos_qual += 1
            elif b > 0:
                neg_count += 1
                if qualified:
                    neg_qual += 1

        pos_conf = pos_qual / pos_count if pos_count > 0 else 0.0
        neg_conf = neg_qual / neg_count if neg_count > 0 else 0.0

        results.append({
            't2': t2_val,
            'p2': p2_val,
            'pos_conf': pos_conf,
            'neg_conf': neg_conf,
        })

    return results


# ============================================================
# 3. Synthetic Bubble Data Generator
# ============================================================

def generate_bubble_data(n_days=500, tc_day=480, m=0.5, w=8.0, seed=42):
    """
    Generate synthetic log-price with LPPLS dynamics + noise.

    Phase 1 (day 0 ~ n_pre): normal growth
    Phase 2 (day n_pre ~ tc): bubble with LPPLS
    Phase 3 (day tc ~ end): crash
    """
    rng = np.random.default_rng(seed)
    t = np.arange(n_days, dtype=np.float64)

    n_pre = 100
    a = 8.0
    b = -0.5
    c1 = 0.05
    c2 = 0.03

    log_price = np.zeros(n_days)

    for i in range(n_days):
        if i < n_pre:
            log_price[i] = 4.5 + 0.002 * i + rng.normal(0, 0.005)
        elif i < tc_day:
            dt_val = max(tc_day - i, 0.1)
            lppls_val = a + (dt_val ** m) * (
                b + c1 * np.cos(w * np.log(dt_val)) + c2 * np.sin(w * np.log(dt_val))
            )
            log_price[i] = lppls_val + rng.normal(0, 0.01)
        else:
            crash_days = i - tc_day
            log_price[i] = log_price[tc_day - 1] - 0.005 * crash_days + rng.normal(0, 0.015)

    return t, log_price


# ============================================================
# 4. Main Demo
# ============================================================

def main():
    np.random.seed(42)

    print("=" * 60)
    print("LPPLS Signal Analysis Demo")
    print("=" * 60)

    # --- Generate synthetic bubble ---
    tc_true = 450
    t, log_price = generate_bubble_data(n_days=500, tc_day=tc_true, m=0.5, w=8.0)
    print(f"\nSynthetic data: {len(t)} days, true tc = day {tc_true}")

    # --- Single fit on the bubble phase ---
    bubble_start = 100
    bubble_end = 440  # slightly before tc
    t_fit = t[bubble_start:bubble_end]
    p_fit = log_price[bubble_start:bubble_end]

    print("\n--- Single LPPLS Fit ---")
    params = fit_lppls(t_fit, p_fit, max_searches=50)
    if params:
        print(f"  tc = {params['tc']:.1f} (true={tc_true})")
        print(f"  m  = {params['m']:.4f}")
        print(f"  ω  = {params['w']:.4f}")
        print(f"  B  = {params['b']:.4f} ({'Positive bubble' if params['b'] < 0 else 'Negative bubble'})")
        O = get_oscillations(params['w'], params['tc'], t_fit[0], t_fit[-1])
        D = get_damping(params['m'], params['w'], params['b'], params['c'])
        print(f"  O  = {O:.2f} oscillations")
        print(f"  D  = {D:.2f} damping ratio")
    else:
        print("  Fit failed!")
        return

    # --- Compute confidence indicator ---
    print("\n--- Computing Multi-Scale Confidence Indicator ---")
    print("  (This may take 1-3 minutes with reduced search parameters...)")
    ci_results = compute_confidence_indicator(
        t, log_price,
        window_max=120,
        window_min=30,
        outer_step=5,
        inner_step=10,
        max_searches=10,
    )

    ci_t2 = [r['t2'] for r in ci_results]
    ci_pos = [r['pos_conf'] for r in ci_results]
    ci_neg = [r['neg_conf'] for r in ci_results]

    print(f"  Computed {len(ci_results)} time points")

    # summary around tc
    near_tc = [r for r in ci_results if tc_true - 60 <= r['t2'] <= tc_true]
    if near_tc:
        avg_pos = np.mean([r['pos_conf'] for r in near_tc])
        print(f"  Mean pos_conf near tc (last 60 days): {avg_pos:.3f}")

    # --- Plot ---
    fig, axes = plt.subplots(4, 1, figsize=(14, 14), sharex=True,
                              gridspec_kw={'height_ratios': [2, 1, 1, 1]})

    # Panel 1: Price + LPPLS fit
    axes[0].plot(t, log_price, 'k-', linewidth=0.7, label='Log Price')
    if params:
        t_dense = np.linspace(t_fit[0], t_fit[-1], 500)
        fitted = lppls_func(t_dense, params['tc'], params['m'], params['w'],
                            params['a'], params['b'], params['c1'], params['c2'])
        axes[0].plot(t_dense, fitted, 'b-', linewidth=1.2, alpha=0.7, label='LPPLS Fit')
        axes[0].axvline(params['tc'], color='red', linestyle='--', alpha=0.7,
                        label=f'tc={params["tc"]:.0f}')
    axes[0].axvline(tc_true, color='orange', linestyle=':', alpha=0.7,
                    label=f'True tc={tc_true}')
    axes[0].axvline(100, color='gray', linestyle=':', alpha=0.3)
    axes[0].set_ylabel('ln(Price)')
    axes[0].set_title('LPPLS Fit on Synthetic Bubble Data')
    axes[0].legend(loc='upper left', fontsize=8)
    axes[0].grid(True, alpha=0.3)

    # Panel 2: Positive bubble confidence
    axes[1].fill_between(ci_t2, ci_pos, alpha=0.4, color='red')
    axes[1].plot(ci_t2, ci_pos, 'r-', linewidth=0.8)
    axes[1].axhline(0.5, color='gray', linestyle='--', linewidth=0.5)
    axes[1].axvline(tc_true, color='orange', linestyle=':', alpha=0.7)
    axes[1].set_ylabel('Pos Conf')
    axes[1].set_title('Positive Bubble Confidence Indicator')
    axes[1].set_ylim(0, 1)
    axes[1].grid(True, alpha=0.3)

    # Panel 3: Negative bubble confidence
    axes[2].fill_between(ci_t2, ci_neg, alpha=0.4, color='green')
    axes[2].plot(ci_t2, ci_neg, 'g-', linewidth=0.8)
    axes[2].axhline(0.5, color='gray', linestyle='--', linewidth=0.5)
    axes[2].axvline(tc_true, color='orange', linestyle=':', alpha=0.7)
    axes[2].set_ylabel('Neg Conf')
    axes[2].set_title('Negative Bubble Confidence Indicator')
    axes[2].set_ylim(0, 1)
    axes[2].grid(True, alpha=0.3)

    # Panel 4: Price level (not log) for context
    axes[3].plot(t, np.exp(log_price), 'k-', linewidth=0.7)
    axes[3].axvline(tc_true, color='orange', linestyle=':', alpha=0.7, label=f'True tc={tc_true}')
    axes[3].set_ylabel('Price')
    axes[3].set_xlabel('Trading Day')
    axes[3].set_title('Price (Level)')
    axes[3].legend(fontsize=8)
    axes[3].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig('lppls_demo.png', dpi=150)
    plt.close()
    print(f"\nPlot saved to lppls_demo.png")

    # --- Using the lppls library ---
    print("\n" + "=" * 60)
    print("Using 'lppls' Library (Boulder Investment Technologies)")
    print("=" * 60)
    try:
        from lppls import lppls as lppls_lib

        base_date = datetime(2020, 1, 1)
        ordinal_times = np.array([
            (base_date + timedelta(days=int(d))).toordinal() for d in t
        ], dtype=np.float64)
        observations = np.array([ordinal_times, log_price])

        model = lppls_lib.LPPLS(observations=observations[:, bubble_start:bubble_end])
        tc_lib, m_lib, w_lib, a_lib, b_lib, c_lib, c1_lib, c2_lib, O_lib, D_lib = \
            model.fit(max_searches=25)

        if tc_lib > 0:
            tc_date = datetime.fromordinal(int(tc_lib))
            true_tc_date = base_date + timedelta(days=tc_true)
            print(f"  tc = {tc_date.strftime('%Y-%m-%d')} "
                  f"(true: {true_tc_date.strftime('%Y-%m-%d')})")
            print(f"  m  = {m_lib:.4f}, ω = {w_lib:.4f}")
            print(f"  B  = {b_lib:.4f}, O = {O_lib:.2f}, D = {D_lib:.2f}")
        else:
            print("  Library fit returned zeros (failed to converge)")

    except ImportError:
        print("  lppls library not installed. Install with: pip install lppls")
    except Exception as e:
        print(f"  Library fit error: {e}")

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print("""
LPPLS 信号分析要点:

1. 模型核心: 超指数增长 + 对数周期振荡 → 有限时间奇点 (tc)
2. 单次拟合不可靠, 需要多尺度嵌套拟合构建置信度指标
3. pos_conf > 0.5 → 正向泡沫信号; neg_conf > 0.5 → 负向泡沫信号
4. tc 是概率分布, 不是精确预测
5. 应与其他指标 (Hurst, 估值, 情绪) 结合使用
""")


if __name__ == "__main__":
    main()
