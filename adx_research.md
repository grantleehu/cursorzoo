# ADX 指标计算与应用 调研报告

## 1. 概述

**ADX (Average Directional Index)** 由 J. Welles Wilder 于 1978 年在《New Concepts in Technical Trading Systems》一书中提出，是最经典的**趋势强度**度量指标。

核心特点：
- ADX 度量的是**趋势强度**，不是方向——ADX 上升既可能发生在上涨中也可能发生在下跌中
- 方向信息由配套的 **+DI / -DI** 提供
- 三者组合称为 **DMI (Directional Movement Indicator)** 系统

## 2. 完整计算流程

ADX 的计算链条较长，共 5 步。以标准 14 周期为例：

### 2.1 Step 1: True Range (TR)

$$TR_t = \max\begin{cases} H_t - L_t \\ |H_t - C_{t-1}| \\ |L_t - C_{t-1}| \end{cases}$$

其中 H = High, L = Low, C = Close。TR 衡量单根 K 线的真实波动幅度（考虑跳空缺口）。

### 2.2 Step 2: Directional Movement (+DM, -DM)

```
UpMove   = H[t] - H[t-1]
DownMove = L[t-1] - L[t]

if UpMove > DownMove and UpMove > 0:
    +DM = UpMove
else:
    +DM = 0

if DownMove > UpMove and DownMove > 0:
    -DM = DownMove
else:
    -DM = 0
```

关键规则：
- +DM 和 -DM **不可能同时为正**（只取较大的一方）
- 如果 UpMove == DownMove，则两者都为 0（inside bar）

### 2.3 Step 3: Wilder Smoothing (14 周期平滑)

Wilder 使用自己发明的平滑方法（等价于 EMA(2N-1)）：

```
# 初始化（第一个值）
SmoothedTR[14]  = sum(TR[1:15])
Smoothed+DM[14] = sum(+DM[1:15])
Smoothed-DM[14] = sum(-DM[1:15])

# 后续值
SmoothedTR[t]  = SmoothedTR[t-1]  - SmoothedTR[t-1]/14  + TR[t]
Smoothed+DM[t] = Smoothed+DM[t-1] - Smoothed+DM[t-1]/14 + +DM[t]
Smoothed-DM[t] = Smoothed-DM[t-1] - Smoothed-DM[t-1]/14 + -DM[t]
```

等价公式：$S_t = S_{t-1} \times \frac{N-1}{N} + X_t = S_{t-1} \times \frac{13}{14} + X_t$

### 2.4 Step 4: +DI, -DI 和 DX

$$+DI_t = \frac{Smoothed(+DM)_t}{Smoothed(TR)_t} \times 100$$

$$-DI_t = \frac{Smoothed(-DM)_t}{Smoothed(TR)_t} \times 100$$

$$DX_t = \frac{|+DI_t - (-DI_t)|}{+DI_t + (-DI_t)} \times 100$$

### 2.5 Step 5: ADX (对 DX 再做一次 Wilder 平滑)

```
# 初始化
ADX[27] = mean(DX[14:28])   # 前 14 个 DX 的均值

# 后续值
ADX[t] = (ADX[t-1] * 13 + DX[t]) / 14
```

注意：计算 ADX 需要**至少 27 根 K 线**的数据（14 根用于平滑 TR/DM → 13 根 DX → 14 根 DX 平均得到第一个 ADX）。

### 2.6 ADXR（可选的进一步平滑）

$$ADXR_t = \frac{ADX_t + ADX_{t-n}}{2}$$

ADXR 是 ADX 的移动平均版本，反应更迟缓但更平滑，用于过滤 ADX 自身的波动。

### 2.7 计算流程图

```
OHLC 数据
  │
  ├── True Range (TR)
  │     │
  │     └── Wilder Smooth(14) ──→ ATR
  │
  ├── +DM (向上方向运动)
  │     │
  │     └── Wilder Smooth(14) ──→ +DI = Smooth(+DM) / ATR × 100
  │
  ├── -DM (向下方向运动)
  │     │
  │     └── Wilder Smooth(14) ──→ -DI = Smooth(-DM) / ATR × 100
  │
  └── DX = |+DI - -DI| / (+DI + -DI) × 100
        │
        └── Wilder Smooth(14) ──→ ADX
                                    │
                                    └── 简单平均 ──→ ADXR (可选)
```

## 3. 指标解读

### 3.1 ADX 数值含义

| ADX 范围 | 趋势状态 | 行动建议 |
|----------|---------|---------|
| 0 ~ 15 | 极弱/无趋势 | 避免趋势策略；考虑区间策略 |
| 15 ~ 20 | 弱趋势 / 蓄势期 | 观望；可能是突破前的能量积累 |
| 20 ~ 25 | 趋势初现 | 准备入场；等待确认 |
| 25 ~ 35 | 强趋势 | 趋势策略最佳区间 |
| 35 ~ 50 | 非常强的趋势 | 持仓跟随；注意极端后的回调 |
| > 50 | 极端趋势 | 罕见；趋势可能临近耗竭 |

### 3.2 ADX 斜率的意义

| 状态 | 含义 |
|------|------|
| **ADX 上升** | 趋势在加强（无论涨跌） |
| **ADX 下降** | 趋势在减弱；可能进入震荡 |
| **ADX 拐头向上** | 新趋势可能开始 |
| **ADX 拐头向下** | 当前趋势可能结束 |

### 3.3 +DI / -DI 交叉

| 信号 | 含义 |
|------|------|
| **+DI 上穿 -DI** | 多头方向运动 > 空头方向运动 → 看多 |
| **-DI 上穿 +DI** | 空头方向运动 > 多头方向运动 → 看空 |
| **+DI 与 -DI 缠绕** | 方向不明，趋势不清 |

### 3.4 综合判断矩阵

| ADX | +DI vs -DI | 市场状态 | 策略 |
|-----|-----------|---------|------|
| > 25 & 上升 | +DI > -DI | **强势上涨趋势** | 做多 / 趋势跟踪 |
| > 25 & 上升 | -DI > +DI | **强势下跌趋势** | 做空 / 趋势跟踪 |
| > 25 & 下降 | +DI > -DI | 上涨趋势减弱 | 缩减多头 / 锁利 |
| > 25 & 下降 | -DI > +DI | 下跌趋势减弱 | 缩减空头 / 锁利 |
| < 20 | 缠绕 | **震荡市** | 均值回归 / 区间策略 |
| < 20 → 上穿 25 | 分离 | **突破启动** | 新趋势入场 |

## 4. 应用策略

### 4.1 Strategy 1: ADX 趋势过滤器

最基础也最有效的用法——**不用 ADX 做入场信号，而是用它过滤其他策略**。

```python
def adx_trend_filter(adx, threshold=25):
    """
    ADX > threshold → 允许趋势策略入场
    ADX < threshold → 禁止趋势策略，切换到区间策略
    """
    if adx > threshold:
        return "TREND_MODE"
    else:
        return "RANGE_MODE"
```

回测研究表明：添加 ADX 过滤器后，趋势策略的胜率和盈亏比均显著提升，尽管交易频率下降。

### 4.2 Strategy 2: DI 交叉 + ADX 确认

```
入场做多条件:
  1. +DI 上穿 -DI
  2. ADX > 20 且 ADX 斜率为正（过去 5 根 K 线 ADX 上升 > 2 点）

入场做空条件:
  1. -DI 上穿 +DI
  2. ADX > 20 且 ADX 斜率为正

出场条件:
  - ADX 拐头向下 (连续 3 根下降)
  - 或反向 DI 交叉
  - 或固定止损/止盈
```

### 4.3 Strategy 3: ADX 突破策略

```
蓄势阶段:
  ADX < 20 持续 N 天 (能量积累)

触发阶段:
  ADX 上穿 25 → 突破确认

方向判定:
  +DI > -DI → 做多
  -DI > +DI → 做空

出场:
  ADX 拐头向下 且 ADX > 30 (趋势耗竭)
```

### 4.4 Strategy 4: ADX + Hurst 双指标 Regime 切换

将 ADX（短期、价格结构层面）与 Hurst（长期、统计层面）结合：

```python
def regime_strategy(hurst, adx, plus_di, minus_di):
    """
    Hurst: 50-200日滚动窗口
    ADX:   14周期标准设置
    """
    if hurst > 0.55 and adx > 25:
        # 长期持久 + 短期趋势确认
        if plus_di > minus_di:
            return "STRONG_LONG"
        else:
            return "STRONG_SHORT"

    elif hurst < 0.45 and adx < 20:
        # 长期反持久 + 短期无趋势
        return "MEAN_REVERSION"

    elif hurst > 0.55 and adx < 20:
        # 长期趋势 but 短期蓄势 → 等待突破
        return "WAIT_BREAKOUT"

    elif hurst < 0.45 and adx > 25:
        # 长期均值回归 but 短期趋势 → 可能是假突破
        return "CAUTION_FALSE_BREAKOUT"

    else:
        return "NEUTRAL"
```

### 4.5 Strategy 5: ADX 趋势耗竭检测

```
if ADX > 40 and ADX 连续 3 天下降:
    当前趋势可能即将结束
    准备反向策略或平仓

if ADX 从 > 45 回落至 < 35:
    趋势大概率已结束
    切换到区间策略
```

### 4.6 Strategy 6: ADX + LPPLS 泡沫预警增强

```python
def enhanced_bubble_warning(adx, adx_slope, lppls_pos_conf, hurst):
    """三重确认：趋势加速 + 统计持久 + 泡沫信号"""
    if lppls_pos_conf > 0.5 and adx > 35 and adx_slope > 0 and hurst > 0.6:
        return "HIGH_BUBBLE_RISK"
    elif lppls_pos_conf > 0.3 and adx > 25:
        return "MODERATE_BUBBLE_RISK"
    else:
        return "LOW_RISK"
```

## 5. Python 实现

### 5.1 完整手写实现

```python
import numpy as np
import pandas as pd

def compute_adx(high, low, close, period=14):
    """
    计算完整的 ADX/+DI/-DI 系统。

    Parameters
    ----------
    high, low, close : array-like
        OHLC 数据中的 H, L, C 列。
    period : int
        Wilder 平滑周期，默认 14。

    Returns
    -------
    pd.DataFrame with columns: +DM, -DM, TR, +DI, -DI, DX, ADX
    """
    h = np.asarray(high, dtype=np.float64)
    l = np.asarray(low, dtype=np.float64)
    c = np.asarray(close, dtype=np.float64)
    n = len(h)

    # Step 1 & 2: TR, +DM, -DM
    tr = np.zeros(n)
    plus_dm = np.zeros(n)
    minus_dm = np.zeros(n)

    for i in range(1, n):
        h_diff = h[i] - h[i-1]       # UpMove
        l_diff = l[i-1] - l[i]       # DownMove
        tr[i] = max(h[i]-l[i], abs(h[i]-c[i-1]), abs(l[i]-c[i-1]))

        if h_diff > l_diff and h_diff > 0:
            plus_dm[i] = h_diff
        if l_diff > h_diff and l_diff > 0:
            minus_dm[i] = l_diff

    # Step 3: Wilder Smoothing
    smooth_tr = np.zeros(n)
    smooth_plus_dm = np.zeros(n)
    smooth_minus_dm = np.zeros(n)

    smooth_tr[period] = np.sum(tr[1:period+1])
    smooth_plus_dm[period] = np.sum(plus_dm[1:period+1])
    smooth_minus_dm[period] = np.sum(minus_dm[1:period+1])

    for i in range(period+1, n):
        smooth_tr[i] = smooth_tr[i-1] - smooth_tr[i-1]/period + tr[i]
        smooth_plus_dm[i] = smooth_plus_dm[i-1] - smooth_plus_dm[i-1]/period + plus_dm[i]
        smooth_minus_dm[i] = smooth_minus_dm[i-1] - smooth_minus_dm[i-1]/period + minus_dm[i]

    # Step 4: +DI, -DI, DX
    plus_di = np.zeros(n)
    minus_di = np.zeros(n)
    dx = np.zeros(n)

    for i in range(period, n):
        if smooth_tr[i] > 0:
            plus_di[i] = (smooth_plus_dm[i] / smooth_tr[i]) * 100
            minus_di[i] = (smooth_minus_dm[i] / smooth_tr[i]) * 100
        denom = plus_di[i] + minus_di[i]
        if denom > 0:
            dx[i] = (abs(plus_di[i] - minus_di[i]) / denom) * 100

    # Step 5: ADX = Wilder Smooth of DX
    adx = np.zeros(n)
    first_adx_idx = 2 * period - 1  # index 27 for period=14
    if first_adx_idx < n:
        adx[first_adx_idx] = np.mean(dx[period:first_adx_idx+1])
        for i in range(first_adx_idx+1, n):
            adx[i] = (adx[i-1] * (period-1) + dx[i]) / period

    return pd.DataFrame({
        '+DM': plus_dm, '-DM': minus_dm, 'TR': tr,
        '+DI': plus_di, '-DI': minus_di,
        'DX': dx, 'ADX': adx,
    })
```

### 5.2 使用 TA-Lib (如果已安装)

```python
import talib

adx = talib.ADX(high, low, close, timeperiod=14)
plus_di = talib.PLUS_DI(high, low, close, timeperiod=14)
minus_di = talib.MINUS_DI(high, low, close, timeperiod=14)
```

## 6. 注意事项与局限性

### 6.1 滞后性

ADX 经过**两层 Wilder 平滑**（一层在 DM/TR 上，一层在 DX→ADX 上），滞后性较大。当 ADX 显示"强趋势"时，相当一部分行情可能已经走完。

**缓解措施：**
- 缩短周期（7~10 替代 14），牺牲平滑度换取灵敏度
- 关注 ADX 的**斜率变化**而非绝对值
- 配合更快的入场指标（如 K 线形态、短期均线）

### 6.2 ADX 不含方向信息

ADX = 40 可能是强烈的上涨趋势，也可能是强烈的下跌趋势。必须结合 +DI/-DI 或价格位置判断方向。

### 6.3 震荡市中的虚假信号

在长期横盘整理中，+DI/-DI 会频繁交叉产生大量假信号。ADX 本身在低位时也会有小幅波动。

**缓解措施：**
- ADX < 20 时停止交叉信号
- 要求 ADX 斜率 > 2 点/5 根 K 线才确认
- 配合 Hurst 指数做二次过滤

### 6.4 参数选择

| 参数 | 标准值 | 日内交易 | 波段交易 |
|------|-------|---------|---------|
| 周期 | 14 | 7~10 | 14~21 |
| 趋势阈值 | 25 | 20~30 | 25~35 |
| 确认斜率 | 2 pt/5 bar | 3 pt/3 bar | 2 pt/5 bar |

### 6.5 与其他指标的比较

| 指标 | 度量内容 | 速度 | 与 ADX 的关系 |
|------|---------|------|-------------|
| **ATR** | 波动幅度 | 快 | ADX 内部使用 ATR 做归一化 |
| **Hurst** | 长程依赖性 | 慢 | 统计层面的趋势度量，与 ADX 互补 |
| **RSI** | 超买超卖 | 中 | RSI 在趋势中易失效，ADX 可帮助过滤 |
| **MACD** | 趋势方向 + 动量 | 中 | MACD 给方向，ADX 给强度 |
| **Bollinger Bands** | 波动区间 | 中 | BB 收窄 = ADX 低位蓄势 |

## 7. 核心参考文献

1. Wilder, J.W. (1978). *New Concepts in Technical Trading Systems*. Trend Research.
2. Kaufman, P.J. (2020). *Trading Systems and Methods* (6th ed.). John Wiley & Sons.
3. Kirkpatrick, C.D. & Dahlquist, J.R. (2015). *Technical Analysis: The Complete Resource for Financial Market Technicians* (3rd ed.). FT Press.

## 8. 总结

| 维度 | 结论 |
|------|------|
| **计算复杂度** | 中等——需要 OHLC 数据，经过 TR→DM→DI→DX→ADX 五步计算 |
| **最佳用途** | 作为**趋势过滤器**，而非独立入场信号 |
| **核心价值** | 回答"当前市场有没有趋势？强不强？"这个关键问题 |
| **最大局限** | 双层平滑导致滞后；不含方向信息 |
| **推荐组合** | ADX (趋势强度) + Hurst (regime 识别) + LPPLS (泡沫检测) 构成完整的市场状态分析框架 |
