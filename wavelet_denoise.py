"""
Wavelet Denoising for Financial Price Signals
==============================================

Complete implementation covering:
  1. DWT denoising (standard, with decimation)
  2. SWT denoising (stationary/translation-invariant, recommended)
  3. Multiple threshold methods: Universal, SURE, BayesShrink
  4. Soft vs Hard thresholding
  5. Cycle-spinning for artifact reduction
  6. Online (causal) denoising without look-ahead bias
  7. Multi-level decomposition visualization
  8. Comparison on synthetic financial data
"""

import numpy as np
import pywt
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from copy import deepcopy

# ============================================================
# 1. Core Denoising Functions
# ============================================================

def estimate_noise_sigma(detail_coeffs):
    """Estimate noise σ from finest-level detail coefficients via MAD."""
    return np.median(np.abs(detail_coeffs)) / 0.6745


def universal_threshold(sigma, n):
    """Donoho-Johnstone universal threshold: σ √(2 log n)."""
    return sigma * np.sqrt(2 * np.log(n))


def sure_threshold(coeffs, sigma):
    """
    SURE (Stein's Unbiased Risk Estimate) threshold.
    Selects λ that minimizes the SURE criterion.
    """
    n = len(coeffs)
    sorted_sq = np.sort(coeffs ** 2)
    risks = np.zeros(n)
    cumsum = np.cumsum(sorted_sq)

    for i in range(n):
        lam_sq = sorted_sq[i]
        risks[i] = (n - 2 * (i + 1) + cumsum[i] + (n - i - 1) * lam_sq) / n

    best_idx = np.argmin(risks)
    return np.sqrt(sorted_sq[best_idx])


def bayesshrink_threshold(coeffs, sigma):
    """
    BayesShrink: adaptive threshold per level.
    λ = σ² / σ_signal, where σ_signal = √(max(σ²_coeffs - σ², 0)).
    """
    sigma_y_sq = np.mean(coeffs ** 2)
    sigma_sq = sigma ** 2
    sigma_x = np.sqrt(max(sigma_y_sq - sigma_sq, 0))
    if sigma_x < 1e-10:
        return np.max(np.abs(coeffs))
    return sigma_sq / sigma_x


def apply_threshold(coeffs, threshold, mode='soft'):
    """Apply soft or hard thresholding to wavelet coefficients."""
    if mode == 'soft':
        return pywt.threshold(coeffs, threshold, mode='soft')
    elif mode == 'hard':
        return pywt.threshold(coeffs, threshold, mode='hard')
    else:
        raise ValueError(f"Unknown mode: {mode}")


# ============================================================
# 2. DWT Denoising
# ============================================================

def wavelet_denoise_dwt(signal, wavelet='db4', level=None,
                         threshold_method='universal', threshold_mode='soft'):
    """
    Standard DWT-based denoising.

    Parameters
    ----------
    signal : 1D array
        Input price or return series.
    wavelet : str
        Wavelet family ('db4', 'sym8', 'coif3', etc.).
    level : int or None
        Decomposition level. None = automatic (pywt.dwt_max_level).
    threshold_method : str
        'universal', 'sure', or 'bayes'.
    threshold_mode : str
        'soft' or 'hard'.

    Returns
    -------
    denoised : 1D array
    coeffs_original : list of wavelet coefficients (for visualization)
    coeffs_denoised : list of thresholded coefficients
    """
    sig = np.asarray(signal, dtype=np.float64)
    n = len(sig)

    if level is None:
        level = min(pywt.dwt_max_level(n, pywt.Wavelet(wavelet).dec_len),
                    int(np.log2(n)) - 1)

    coeffs = pywt.wavedec(sig, wavelet, level=level)

    sigma = estimate_noise_sigma(coeffs[-1])

    coeffs_denoised = [coeffs[0].copy()]  # keep approximation untouched
    for i in range(1, len(coeffs)):
        d = coeffs[i]
        if threshold_method == 'universal':
            thresh = universal_threshold(sigma, n)
        elif threshold_method == 'sure':
            thresh = sure_threshold(d, sigma)
        elif threshold_method == 'bayes':
            thresh = bayesshrink_threshold(d, sigma)
        else:
            raise ValueError(f"Unknown method: {threshold_method}")

        coeffs_denoised.append(apply_threshold(d, thresh, threshold_mode))

    denoised = pywt.waverec(coeffs_denoised, wavelet)[:n]

    return denoised, coeffs, coeffs_denoised


# ============================================================
# 3. SWT Denoising (Translation-Invariant, Recommended)
# ============================================================

def wavelet_denoise_swt(signal, wavelet='db4', level=None,
                         threshold_method='universal', threshold_mode='soft'):
    """
    Stationary Wavelet Transform (SWT) denoising.

    SWT is translation-invariant (no downsampling), producing smoother
    results with fewer boundary artifacts than standard DWT.

    Requirements: signal length must be divisible by 2^level.
    """
    sig = np.asarray(signal, dtype=np.float64)
    n = len(sig)

    if level is None:
        max_lev = pywt.swt_max_level(n)
        level = min(max_lev, int(np.log2(n)) - 1, 8)

    pad_len = 0
    required = int(2 ** level)
    if n % required != 0:
        pad_len = required - (n % required)
        sig = np.pad(sig, (0, pad_len), mode='edge')

    coeffs = pywt.swt(sig, wavelet, level=level, trim_approx=True)
    # coeffs[0] = approximation, coeffs[1:] = details (coarse to fine)

    sigma = estimate_noise_sigma(coeffs[-1])

    coeffs_denoised = [coeffs[0].copy()]
    for i in range(1, len(coeffs)):
        d = coeffs[i]
        if threshold_method == 'universal':
            thresh = universal_threshold(sigma, len(sig))
        elif threshold_method == 'sure':
            thresh = sure_threshold(d, sigma)
        elif threshold_method == 'bayes':
            thresh = bayesshrink_threshold(d, sigma)
        else:
            raise ValueError(f"Unknown method: {threshold_method}")
        coeffs_denoised.append(apply_threshold(d, thresh, threshold_mode))

    denoised = pywt.iswt(coeffs_denoised, wavelet)
    denoised = denoised[:n]

    return denoised, coeffs, coeffs_denoised


# ============================================================
# 4. Cycle-Spinning (Translation Averaging)
# ============================================================

def wavelet_denoise_cycle_spinning(signal, wavelet='db4', level=None,
                                    threshold_method='universal',
                                    threshold_mode='soft', n_shifts=10):
    """
    Cycle-spinning: average DWT denoising across multiple circular shifts.

    Reduces Gibbs-like artifacts near discontinuities by exploiting
    translation invariance through averaging.
    """
    sig = np.asarray(signal, dtype=np.float64)
    n = len(sig)
    accumulated = np.zeros(n)

    for s in range(n_shifts):
        shift = s * (n // n_shifts)
        shifted = np.roll(sig, -shift)
        denoised_shifted, _, _ = wavelet_denoise_dwt(
            shifted, wavelet, level, threshold_method, threshold_mode
        )
        accumulated += np.roll(denoised_shifted, shift)

    return accumulated / n_shifts


# ============================================================
# 5. Online (Causal) Denoising — No Look-Ahead Bias
# ============================================================

def wavelet_denoise_online(signal, wavelet='db4', level=3,
                            threshold_method='universal',
                            threshold_mode='soft',
                            min_window=64):
    """
    Causal wavelet denoising: at each time t, only use data up to t.

    This avoids look-ahead bias for trading applications.
    Slower than batch methods but safe for live signals.
    """
    sig = np.asarray(signal, dtype=np.float64)
    n = len(sig)
    denoised = np.full(n, np.nan)

    for t in range(min_window, n):
        window = sig[:t + 1]
        try:
            d, _, _ = wavelet_denoise_swt(
                window, wavelet, level, threshold_method, threshold_mode
            )
            denoised[t] = d[-1]
        except Exception:
            denoised[t] = sig[t]

    return denoised


# ============================================================
# 6. Multi-Resolution Decomposition (for analysis)
# ============================================================

def decompose_signal(signal, wavelet='db4', level=4):
    """
    Full multi-resolution decomposition using SWT.
    Returns approximation + detail at each level.
    """
    sig = np.asarray(signal, dtype=np.float64)
    n = len(sig)

    required = int(2 ** level)
    if n % required != 0:
        pad = required - (n % required)
        sig = np.pad(sig, (0, pad), mode='edge')

    coeffs = pywt.swt(sig, wavelet, level=level, trim_approx=True)

    result = {
        'approximation': coeffs[0][:n],
    }
    for i in range(1, len(coeffs)):
        result[f'detail_L{level - i + 1}'] = coeffs[i][:n]

    return result


# ============================================================
# 7. Synthetic Financial Data
# ============================================================

def generate_price_signal(n=1000, seed=42):
    """
    Generate a price series = smooth trend + structure + noise.
    """
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=np.float64)

    trend = 100 + 0.02 * t + 5 * np.sin(2 * np.pi * t / 200)

    # Medium-frequency oscillation
    structure = 3 * np.sin(2 * np.pi * t / 50) + 1.5 * np.sin(2 * np.pi * t / 25)

    # Regime change (sharp move)
    jump = np.zeros(n)
    jump[400:] += 8
    jump[700:] -= 12

    clean = trend + structure + jump
    noise = rng.normal(0, 2.0, n)
    noisy = clean + noise

    return noisy, clean, noise


# ============================================================
# 8. Main Demo
# ============================================================

def main():
    print("=" * 65)
    print("Wavelet Denoising for Financial Price Signals")
    print("=" * 65)

    noisy, clean, noise = generate_price_signal(n=1024, seed=42)
    n = len(noisy)
    true_sigma = np.std(noise)
    print(f"\nData: {n} points, true noise σ = {true_sigma:.3f}")

    # --- Available wavelets ---
    print("\nCommon wavelet families for finance:")
    for wname in ['db4', 'db8', 'sym4', 'sym8', 'coif3']:
        w = pywt.Wavelet(wname)
        print(f"  {wname:6s}: vanishing moments={w.dec_len//2}, "
              f"filter length={w.dec_len}")

    # ===============================
    # Compare methods
    # ===============================
    methods = {
        'DWT + Universal + Soft':
            lambda s: wavelet_denoise_dwt(s, 'db4', 4, 'universal', 'soft')[0],
        'DWT + Universal + Hard':
            lambda s: wavelet_denoise_dwt(s, 'db4', 4, 'universal', 'hard')[0],
        'DWT + SURE + Soft':
            lambda s: wavelet_denoise_dwt(s, 'db4', 4, 'sure', 'soft')[0],
        'DWT + BayesShrink':
            lambda s: wavelet_denoise_dwt(s, 'db4', 4, 'bayes', 'soft')[0],
        'SWT + Universal + Soft':
            lambda s: wavelet_denoise_swt(s, 'db4', 4, 'universal', 'soft')[0],
        'SWT + BayesShrink':
            lambda s: wavelet_denoise_swt(s, 'db4', 4, 'bayes', 'soft')[0],
        'Cycle-Spinning (10 shifts)':
            lambda s: wavelet_denoise_cycle_spinning(s, 'db4', 4, 'universal', 'soft', 10),
    }

    results = {}
    print(f"\n{'Method':<35s} {'RMSE':>8s} {'MAE':>8s} {'σ_est':>8s}")
    print("-" * 62)

    for name, func in methods.items():
        denoised = func(noisy)
        rmse = np.sqrt(np.mean((denoised - clean) ** 2))
        mae = np.mean(np.abs(denoised - clean))
        residual_noise = noisy - denoised
        sigma_est = np.std(residual_noise)
        results[name] = denoised
        print(f"  {name:<33s} {rmse:8.4f} {mae:8.4f} {sigma_est:8.4f}")

    print(f"\n  {'No denoising (raw)':<33s} {np.sqrt(np.mean(noise**2)):8.4f} "
          f"{np.mean(np.abs(noise)):8.4f} {true_sigma:8.4f}")

    # --- Wavelet comparison ---
    print(f"\n--- Wavelet Family Comparison (SWT + BayesShrink) ---")
    print(f"{'Wavelet':<10s} {'RMSE':>8s}")
    print("-" * 20)
    for wname in ['db2', 'db4', 'db8', 'sym4', 'sym8', 'coif3']:
        try:
            d = wavelet_denoise_swt(noisy, wname, 4, 'bayes', 'soft')[0]
            rmse = np.sqrt(np.mean((d - clean) ** 2))
            print(f"  {wname:<8s} {rmse:8.4f}")
        except Exception as e:
            print(f"  {wname:<8s} Error: {e}")

    # --- Level comparison ---
    print(f"\n--- Decomposition Level Comparison (SWT db4 BayesShrink) ---")
    print(f"{'Level':>5s} {'RMSE':>8s}")
    print("-" * 15)
    for lv in range(1, 9):
        try:
            d = wavelet_denoise_swt(noisy, 'db4', lv, 'bayes', 'soft')[0]
            rmse = np.sqrt(np.mean((d - clean) ** 2))
            print(f"  {lv:>3d}   {rmse:8.4f}")
        except Exception:
            pass

    # ===============================
    # PLOT
    # ===============================
    fig = plt.figure(figsize=(16, 22))

    # Panel 1: Original vs Denoised
    ax1 = fig.add_subplot(5, 1, 1)
    ax1.plot(noisy, 'gray', linewidth=0.4, alpha=0.6, label='Noisy')
    ax1.plot(clean, 'k-', linewidth=1.0, label='Clean (ground truth)')
    ax1.plot(results['SWT + BayesShrink'], 'r-', linewidth=0.9,
             alpha=0.8, label='SWT + BayesShrink')
    ax1.set_ylabel('Price')
    ax1.set_title('Wavelet Denoising: Noisy vs Clean vs Denoised')
    ax1.legend(fontsize=8)
    ax1.grid(True, alpha=0.3)

    # Panel 2: Method comparison (zoom)
    ax2 = fig.add_subplot(5, 1, 2)
    zoom = slice(350, 500)
    ax2.plot(range(350, 500), noisy[zoom], 'gray', linewidth=0.5, alpha=0.5, label='Noisy')
    ax2.plot(range(350, 500), clean[zoom], 'k-', linewidth=1.5, label='Clean')
    for name, color in [('DWT + Universal + Soft', 'blue'),
                         ('SWT + BayesShrink', 'red'),
                         ('Cycle-Spinning (10 shifts)', 'green')]:
        ax2.plot(range(350, 500), results[name][zoom], color=color,
                 linewidth=0.9, alpha=0.8, label=name)
    ax2.set_ylabel('Price')
    ax2.set_title('Zoom: Day 350-500 (regime change at day 400)')
    ax2.legend(fontsize=7)
    ax2.grid(True, alpha=0.3)

    # Panel 3: Soft vs Hard threshold
    ax3 = fig.add_subplot(5, 1, 3)
    ax3.plot(range(350, 500), clean[zoom], 'k-', linewidth=1.5, label='Clean')
    ax3.plot(range(350, 500), results['DWT + Universal + Soft'][zoom],
             'b-', linewidth=0.9, label='Soft threshold')
    ax3.plot(range(350, 500), results['DWT + Universal + Hard'][zoom],
             'r-', linewidth=0.9, label='Hard threshold')
    ax3.set_ylabel('Price')
    ax3.set_title('Soft vs Hard Thresholding (zoom)')
    ax3.legend(fontsize=8)
    ax3.grid(True, alpha=0.3)

    # Panel 4: Multi-resolution decomposition
    decomp = decompose_signal(noisy, 'db4', level=4)
    ax4_keys = ['approximation', 'detail_L4', 'detail_L3', 'detail_L2', 'detail_L1']
    ax4_labels = ['Approximation (A4)\n≈ long-term trend',
                  'Detail L4\n≈ low-freq structure',
                  'Detail L3\n≈ medium-freq',
                  'Detail L2\n≈ high-freq',
                  'Detail L1\n≈ noise']

    gs = fig.add_gridspec(5, 1, hspace=0.4)
    ax_decomp = fig.add_subplot(5, 1, 4)
    ax_decomp.axis('off')
    ax_decomp.set_title('Multi-Resolution Decomposition (SWT, db4, 4 levels)', fontsize=11)

    fig_inner, axes_inner = plt.subplots(5, 1, figsize=(16, 8), sharex=True)
    for idx, (key, label) in enumerate(zip(ax4_keys, ax4_labels)):
        axes_inner[idx].plot(decomp[key], 'b-', linewidth=0.5)
        axes_inner[idx].set_ylabel(label, fontsize=7)
        axes_inner[idx].grid(True, alpha=0.3)
    axes_inner[-1].set_xlabel('Time')
    fig_inner.suptitle('Multi-Resolution Decomposition (SWT, db4, 4 levels)', fontsize=11)
    fig_inner.tight_layout()
    fig_inner.savefig('wavelet_decomposition.png', dpi=150)
    plt.close(fig_inner)

    # Panel 5: Denoising residuals
    ax5 = fig.add_subplot(5, 1, 5)
    residual_swt = noisy - results['SWT + BayesShrink']
    ax5.plot(residual_swt, 'b-', linewidth=0.3, alpha=0.7, label='Removed noise (SWT Bayes)')
    ax5.plot(noise, 'gray', linewidth=0.3, alpha=0.5, label='True noise')
    ax5.axhline(0, color='k', linewidth=0.5)
    ax5.set_ylabel('Residual')
    ax5.set_xlabel('Time')
    ax5.set_title('Denoising Residuals vs True Noise')
    ax5.legend(fontsize=8)
    ax5.grid(True, alpha=0.3)

    fig.tight_layout()
    fig.savefig('wavelet_denoise.png', dpi=150)
    plt.close(fig)
    print(f"\nPlots saved to wavelet_denoise.png and wavelet_decomposition.png")

    # --- Summary ---
    print("\n" + "=" * 65)
    print("WAVELET DENOISING: COMPLETE GUIDE")
    print("=" * 65)
    print("""
一、核心流程 (3 步)

  Step 1: 小波分解
    coeffs = pywt.wavedec(price, 'db4', level=4)
    → coeffs = [A4, D4, D3, D2, D1]
    → A4 = 近似 (低频趋势), D1~D4 = 细节 (高频→低频)

  Step 2: 阈值处理 (只处理 D1~D4, 不动 A4)
    - 估计噪声 σ: MAD(D1) / 0.6745
    - 计算阈值 λ:
        Universal:  λ = σ √(2 log n)     — 简单但偏保守
        BayesShrink: λ = σ²/σ_signal     — 自适应, 推荐
        SURE:       最小化 Stein 风险估计  — 理论最优
    - 软阈值: sign(x) × max(|x| - λ, 0)  — 平滑, 推荐
    - 硬阈值: x if |x| > λ else 0         — 保留峰值但有跳变

  Step 3: 重构
    denoised = pywt.waverec(coeffs_thresholded, 'db4')

二、关键选择

  小波族:
    db4    — 最常用, 平衡光滑性和紧支撑
    db8    — 更光滑, 适合平稳趋势
    sym8   — 近似对称, 减少相位偏移
    coif3  — 近似对称 + 高消失矩

  分解层数:
    层数过少 → 去噪不充分 (噪声残留在高层细节中)
    层数过多 → 丢失有意义的高频结构
    经验: level = 3~5 对日频金融数据
    自动: level = int(log2(N)) - 1

  DWT vs SWT:
    DWT  — 快, 但有平移不变性问题 (信号平移导致结果变化)
    SWT  — 慢, 但平移不变, 去噪更平滑, 无下采样伪影
    推荐: 金融数据优先用 SWT

三、金融应用注意事项

  1. Look-Ahead Bias (前视偏差):
     - 批量小波去噪使用了整段数据 → 包含未来信息!
     - 实盘/回测中必须用 online 模式: 每个 t 只用 data[:t+1]
     - 或者用 expanding window: 每天重新对历史数据去噪

  2. 边界效应:
     - DWT 在序列两端产生伪影
     - 用 SWT 或 cycle-spinning 缓解
     - 不要信任去噪后序列的头尾 ~kernel_size 个点

  3. 过度去噪:
     - 阈值太高 → 把有意义的结构当噪声去掉了
     - BayesShrink 通常比 Universal 更保守 (保留更多信号)
     - 看残差: 好的去噪应该让残差 ≈ 白噪声

  4. 对价格 vs 收益率:
     - 对价格去噪: 直觉上好理解, 但价格非平稳
     - 对收益率去噪: 更符合统计假设 (近似平稳)
     - 实践中两种都试, 看哪种对下游任务更有帮助

  5. 用途:
     - 去噪后的价格 → 作为 DLinear/Transformer 的输入特征
     - 多分辨率分解 → A4 作为长期趋势, D4 作为周期信号, D1 丢弃
     - 噪声估计 → σ 本身可作为波动率代理特征
""")


if __name__ == "__main__":
    main()
