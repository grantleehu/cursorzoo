# Hurst Exponent 调研报告

## 1. 概述

Hurst 指数 (Hurst Exponent, H) 由英国水文学家 Harold Edwin Hurst 于 1951 年提出，最初用于尼罗河水库容量的设计研究。它是衡量时间序列**长程依赖性 (long-range dependence)** 的核心指标，描述了序列在不同时间尺度上自相关的衰减方式。

Hurst 指数的值域为 `[0, 1]`，不同取值具有截然不同的含义：

| H 值范围 | 行为特征 | 直觉解释 |
|---|---|---|
| H = 0.5 | 随机游走 / 无记忆 | 自相关指数衰减，等价于标准布朗运动 |
| 0.5 < H < 1 | **持久性 (Persistent)** | "趋势延续"——上升倾向于继续上升，下降倾向于继续下降；自相关按幂律缓慢衰减 |
| 0 < H < 0.5 | **反持久性 (Anti-persistent)** | "均值回复"——上升后倾向下降，下降后倾向上升 |

## 2. 数学定义

### 2.1 基于 Rescaled Range (R/S) 的经典定义

对长度为 N 的时间序列 `{X₁, X₂, ..., Xₙ}`，将其分为长度为 n 的子区间，在每个子区间中：

1. 计算均值：$\bar{X}_n = \frac{1}{n} \sum_{i=1}^{n} X_i$
2. 累积离差序列：$Y_t = \sum_{i=1}^{t} (X_i - \bar{X}_n)$, $t = 1, 2, ..., n$
3. 极差：$R(n) = \max(Y_1, ..., Y_n) - \min(Y_1, ..., Y_n)$
4. 标准差：$S(n) = \sqrt{\frac{1}{n} \sum_{i=1}^{n} (X_i - \bar{X}_n)^2}$

Hurst 发现经验关系：

$$E\left[\frac{R(n)}{S(n)}\right] = C \cdot n^H \quad \text{as } n \to \infty$$

通过对 $\log(R/S)$ vs $\log(n)$ 做线性回归，斜率即为 H 的估计值。

### 2.2 与分形维数的关系

$$D = 2 - H$$

其中 D 为时间序列的分形维数。H 越大，序列越光滑 (D 越小)；H 越小，序列越粗糙 (D 越大)。

### 2.3 与自相关函数的关系

对于分数布朗运动 (fBm)，增量过程 (分数高斯噪声, fGn) 在 lag k 处的自相关为：

$$\rho(k) \sim H(2H-1) k^{2H-2} \quad \text{as } k \to \infty$$

- 当 H > 0.5 时，$\rho(k) > 0$ 且按幂律衰减 —— 长程正相关
- 当 H < 0.5 时，$\rho(k) < 0$ 且按幂律衰减 —— 长程负相关
- 当 H = 0.5 时，$\rho(k) = 0$ (k > 0) —— 无相关

## 3. 计算方法

### 3.1 Rescaled Range (R/S) Analysis

**最经典的方法**，由 Hurst 本人提出，Mandelbrot 和 Wallis 进一步发展。

**算法步骤：**
1. 选取一组尺度 `n ∈ {n₁, n₂, ..., nₖ}`
2. 对每个尺度 n，将序列分成 `⌊N/n⌋` 个不重叠的子区间
3. 对每个子区间计算 R/S 值
4. 对同一尺度 n 的所有子区间取均值 `E[R(n)/S(n)]`
5. 对 `log(n)` vs `log(E[R/S])` 做最小二乘回归，斜率即 H

**优点：** 计算简单，O(N) 复杂度
**缺点：** 对趋势敏感（趋势会使 H 虚高）；有限样本偏差（短序列 H 偏高）

### 3.2 Detrended Fluctuation Analysis (DFA)

由 Peng et al. (1994) 提出，是目前**使用最广泛**的方法，尤其适合非平稳序列。

**算法步骤：**
1. 构造 profile：$Y(k) = \sum_{i=1}^{k} (X_i - \bar{X})$
2. 将 Y(k) 分成长度为 s 的不重叠区间
3. 在每个区间内拟合多项式趋势 $\hat{Y}_s(k)$（DFA-1 用线性，DFA-2 用二次，...）
4. 计算去趋势后的均方根波动：$F(s) = \sqrt{\frac{1}{N} \sum_{k=1}^{N} [Y(k) - \hat{Y}_s(k)]^2}$
5. 对 `log(s)` vs `log(F(s))` 做回归，斜率即 H（此处通常记作 α）

**优点：** 能去除局部趋势，对非平稳数据更鲁棒
**缺点：** 计算复杂度略高 O(N log N)；多项式阶数选择影响结果

### 3.3 其他方法

| 方法 | 简述 |
|---|---|
| **Periodogram / GPH 估计** | 基于频谱分析，在零频附近拟合谱密度的幂律行为 |
| **Whittle 估计** | 最大似然方法，统计效率高但需假设参数模型 |
| **Wavelet 方法** | 利用小波系数在不同尺度上的方差来估计 H |
| **MFDFA** | 多重分形 DFA，将 DFA 推广到不同阶矩 q，得到广义 Hurst 指数 h(q) |

### 3.4 方法选择建议

```
序列平稳且较长 (N > 1000)?
  ├── 是 → R/S analysis (经典，简单直观)
  └── 否 → 序列包含趋势或非平稳?
              ├── 是 → DFA (首选，去趋势)
              └── 需要多重分形分析? → MFDFA
```

## 4. Python 实现

### 4.1 环境准备

```bash
pip install numpy matplotlib nolds
```

### 4.2 R/S Analysis 手写实现

```python
import numpy as np
import matplotlib.pyplot as plt

def hurst_rs(series, min_window=10, max_window=None):
    """
    Rescaled Range (R/S) analysis to estimate the Hurst exponent.

    Parameters
    ----------
    series : array-like
        Input time series.
    min_window : int
        Minimum sub-series length.
    max_window : int or None
        Maximum sub-series length. Defaults to N // 4.

    Returns
    -------
    H : float
        Estimated Hurst exponent.
    scales : ndarray
        Window sizes used.
    rs_values : ndarray
        Mean R/S values at each scale.
    """
    series = np.asarray(series, dtype=np.float64)
    N = len(series)
    if max_window is None:
        max_window = N // 4

    scales = []
    rs_values = []

    for n in range(min_window, max_window + 1):
        num_segments = N // n
        if num_segments < 1:
            continue

        rs_list = []
        for seg_idx in range(num_segments):
            segment = series[seg_idx * n : (seg_idx + 1) * n]
            mean_seg = np.mean(segment)
            deviations = segment - mean_seg
            cumulative = np.cumsum(deviations)
            R = np.max(cumulative) - np.min(cumulative)
            S = np.std(segment, ddof=0)
            if S > 0:
                rs_list.append(R / S)

        if rs_list:
            scales.append(n)
            rs_values.append(np.mean(rs_list))

    scales = np.array(scales)
    rs_values = np.array(rs_values)

    log_scales = np.log(scales)
    log_rs = np.log(rs_values)
    H, intercept = np.polyfit(log_scales, log_rs, 1)

    return H, scales, rs_values


def plot_hurst(scales, rs_values, H, title="R/S Analysis"):
    plt.figure(figsize=(8, 5))
    plt.loglog(scales, rs_values, 'bo-', markersize=3, label=f'H = {H:.4f}')
    plt.loglog(scales, np.exp(np.polyval(np.polyfit(np.log(scales), np.log(rs_values), 1), np.log(scales))),
               'r--', label='Linear fit')
    plt.xlabel('Window size (n)')
    plt.ylabel('R/S')
    plt.title(title)
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    plt.savefig('hurst_rs_plot.png', dpi=150)
    plt.close()
```

### 4.3 DFA 手写实现

```python
def dfa(series, scales=None, order=1):
    """
    Detrended Fluctuation Analysis.

    Parameters
    ----------
    series : array-like
        Input time series.
    scales : array-like or None
        Box sizes. Defaults to logarithmically spaced sizes.
    order : int
        Polynomial detrending order (1=linear, 2=quadratic, ...).

    Returns
    -------
    alpha : float
        DFA exponent (equivalent to Hurst exponent for fGn).
    scales : ndarray
        Box sizes used.
    fluct : ndarray
        Fluctuation function values.
    """
    series = np.asarray(series, dtype=np.float64)
    N = len(series)

    profile = np.cumsum(series - np.mean(series))

    if scales is None:
        scales = np.unique(np.logspace(
            np.log10(10), np.log10(N // 4), num=30
        ).astype(int))

    fluct = []
    valid_scales = []

    for s in scales:
        num_segments = N // s
        if num_segments < 1:
            continue

        rms_list = []
        for seg_idx in range(num_segments):
            start = seg_idx * s
            end = start + s
            segment = profile[start:end]
            x = np.arange(s)
            coeffs = np.polyfit(x, segment, order)
            trend = np.polyval(coeffs, x)
            rms_list.append(np.mean((segment - trend) ** 2))

        # Also go backwards to use all data
        for seg_idx in range(num_segments):
            start = N - (seg_idx + 1) * s
            end = start + s
            segment = profile[start:end]
            x = np.arange(s)
            coeffs = np.polyfit(x, segment, order)
            trend = np.polyval(coeffs, x)
            rms_list.append(np.mean((segment - trend) ** 2))

        fluct.append(np.sqrt(np.mean(rms_list)))
        valid_scales.append(s)

    scales = np.array(valid_scales)
    fluct = np.array(fluct)

    log_s = np.log(scales)
    log_f = np.log(fluct)
    alpha, _ = np.polyfit(log_s, log_f, 1)

    return alpha, scales, fluct
```

### 4.4 使用 nolds 库

```python
import nolds
import numpy as np

np.random.seed(42)

# 1. 纯随机游走 (理论 H ≈ 0.5)
white_noise = np.random.randn(5000)
h_rs = nolds.hurst_rs(white_noise, corrected=True)
h_dfa = nolds.dfa(np.cumsum(white_noise))
print(f"White noise:  R/S H = {h_rs:.4f},  DFA α = {h_dfa:.4f}")

# 2. 持久性序列 (H > 0.5)
# 使用简单的趋势叠加模拟
persistent = np.cumsum(np.random.randn(5000) + 0.02)
h_rs_p = nolds.hurst_rs(np.diff(persistent), corrected=True)
print(f"Persistent:   R/S H = {h_rs_p:.4f}")

# 3. 反持久性序列 (H < 0.5)
anti = np.zeros(5000)
for i in range(1, 5000):
    anti[i] = -0.5 * anti[i-1] + np.random.randn()
h_rs_a = nolds.hurst_rs(anti, corrected=True)
print(f"Anti-persist: R/S H = {h_rs_a:.4f}")
```

### 4.5 滚动窗口 Hurst 指数 (金融应用)

```python
def rolling_hurst(series, window=200, step=1, method='rs'):
    """
    Compute rolling Hurst exponent over a sliding window.

    Parameters
    ----------
    series : array-like
        Input time series (e.g., log returns).
    window : int
        Rolling window size.
    step : int
        Step size for the rolling window.
    method : str
        'rs' for R/S analysis, 'dfa' for DFA.

    Returns
    -------
    indices : list of int
        Center indices of each window.
    h_values : list of float
        Hurst exponent estimates.
    """
    series = np.asarray(series, dtype=np.float64)
    N = len(series)
    indices = []
    h_values = []

    for start in range(0, N - window + 1, step):
        segment = series[start : start + window]
        try:
            if method == 'rs':
                h = nolds.hurst_rs(segment, corrected=True)
            else:
                h = nolds.dfa(np.cumsum(segment - np.mean(segment)))
            h_values.append(h)
            indices.append(start + window // 2)
        except Exception:
            continue

    return indices, h_values
```

## 5. 金融市场中的应用

### 5.1 市场状态 (Regime) 识别

通过滚动窗口计算 H，可将市场划分为三种状态：

| 状态 | H 值 | 适合的策略 |
|---|---|---|
| **趋势市** | H > 0.55 | 动量/趋势跟踪策略 |
| **震荡市** | H < 0.45 | 均值回归/配对交易策略 |
| **随机市** | 0.45 ≤ H ≤ 0.55 | 方向性策略困难，考虑波动率策略 |

### 5.2 策略适配

- **H 上升阶段 (从 0.45 → 0.65)**：市场从均值回复转向趋势延续，应增加趋势跟踪仓位
- **H 下降阶段 (从 0.65 → 0.45)**：趋势减弱，均值回复特征增强，切换为逆向策略
- **H 在 0.5 附近**：信号不明确，应降低仓位或使用非方向性策略

### 5.3 配对交易中的应用

研究表明，当配对价差的 Hurst 指数呈现反持久性 (H < 0.5) 时，均值回归的可预测性更强，配对交易策略的胜率显著提高。

### 5.4 窗口大小建议

| 交易频率 | 推荐窗口 | 备注 |
|---|---|---|
| 日线级别 | 100-250 根 K 线 | 约半年到一年的交易日 |
| 小时级别 | 200-500 根 K 线 | 约 1-3 周 |
| 分钟级别 | 500-1000 根 K 线 | 日内 |

## 6. 注意事项与局限性

### 6.1 有限样本偏差

- **数据量不足**：样本少于 200 个数据点时，估计极不可靠；建议至少 500-1000 个数据点
- **R/S 上偏**：R/S 方法在有限样本中倾向于高估 H 值，特别是对短程相关的序列
- **DFA 更稳健**：DFA 在有限样本中的表现优于 R/S，对 H=0.5 的随机游走校准更准确

### 6.2 趋势污染

线性趋势会使 R/S 的 H 估计趋向 1，产生**伪长程依赖**的假象。DFA 通过局部去趋势可以缓解，但不能完全消除非线性趋势的影响。

### 6.3 非平稳性

单一 H 值对非平稳序列可能没有意义——如果序列的统计特性随时间变化，H 仅代表整段数据的平均特征，不能刻画任何特定时段。应使用滚动窗口方法。

### 6.4 厚尾分布

金融收益率的厚尾特征会使极差 R 计算不稳定，极端值主导结果。建议：
- 使用稳健统计方法
- 对数据做 winsorize 处理
- 使用 DFA 替代 R/S

### 6.5 尺度选择敏感性

不同的尺度范围会产生不同的 H 值：
- 尺度太小 → 受噪声主导
- 尺度太大 → 方差过大
- 经验法则：尺度范围 `[10, N/4]`

### 6.6 单分形假设

标准 Hurst 指数假设序列具有单分形 (monofractal) 结构。金融数据往往是多重分形 (multifractal) 的——不同时段和不同强度的波动具有不同的标度行为。此时应使用 **MFDFA (多重分形去趋势波动分析)** 获取广义 Hurst 指数 h(q)。

## 7. 与相关概念的对比

| 概念 | 与 H 的关系 | 适用场景 |
|---|---|---|
| **分形维数 D** | D = 2 - H | 序列粗糙度度量 |
| **自相关函数 ACF** | H > 0.5 ↔ 长程正自相关 | 线性依赖分析 |
| **ARFIMA(p,d,q)** | d = H - 0.5 (对 fGn) | 参数化长记忆建模 |
| **DFA 指数 α** | α = H (对 fGn); α = H + 1 (对 fBm) | 需区分噪声 vs 运动 |
| **Lyapunov 指数** | 度量混沌，非长记忆 | 非线性动力系统 |

## 8. 核心参考文献

1. Hurst, H.E. (1951). "Long-term storage capacity of reservoirs." *Transactions of the American Society of Civil Engineers*, 116, 770-808.
2. Mandelbrot, B.B. & Wallis, J.R. (1969). "Robustness of the rescaled range R/S in the measurement of noncyclic long run statistical dependence." *Water Resources Research*, 5(5), 967-988.
3. Peng, C.K. et al. (1994). "Mosaic organization of DNA nucleotides." *Physical Review E*, 49(2), 1685.
4. Di Matteo, T. et al. (2005). "Long-term memories of developed and emerging markets." *Journal of Banking & Finance*, 29(4), 827-851.
5. Weron, R. (2002). "Estimating long-range dependence: finite sample properties and confidence intervals." *Physica A*, 312(1-2), 285-299.

## 9. 总结

Hurst 指数是时间序列分析中度量长程依赖性的基础工具：

- **理论清晰**：基于 R/S 标度律，与分形维数、自相关函数有明确数学联系
- **方法成熟**：R/S、DFA、Wavelet 等多种估计方法可供选择，DFA 是当前最推荐的方法
- **应用广泛**：在金融市场的 regime 识别、策略适配、风险管理中有实战价值
- **需谨慎使用**：有限样本偏差、趋势污染、尺度选择等问题不可忽视，建议结合多种方法交叉验证
