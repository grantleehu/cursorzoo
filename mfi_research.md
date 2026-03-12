# MFI (Money Flow Index) 计算与应用 调研报告

## 1. 概述

**MFI (Money Flow Index)** 由 Gene Quong 和 Avrum Soudack 提出，被称为**"带量的 RSI"**（Volume-Weighted RSI）。它将成交量信息引入动量振荡器框架，衡量资金的**流入/流出强度**。

核心特点：
- 范围 0 ~ 100，结构与 RSI 完全一致
- 与 RSI 唯一的区别：用 **成交量加权的资金流** 替代了纯价格变化
- 能区分"有量的上涨"和"缩量的上涨"——解决了 RSI 忽略成交量的根本缺陷

### 1.1 MFI vs RSI vs OBV 对比

| 指标 | 输入 | 核心度量 | 值域 | 擅长场景 |
|------|------|---------|------|---------|
| **RSI** | Close | 价格动量（涨幅/跌幅之比） | 0~100 | 纯价格超买超卖 |
| **MFI** | H, L, C, Volume | 资金流动量（流入/流出之比） | 0~100 | 价量共振的超买超卖 |
| **OBV** | Close, Volume | 累积成交量（涨日加、跌日减） | 无界 | 量价趋势背离 |
| **CMF** | H, L, C, Volume | Chaikin 资金流（CLV×Volume 的均值） | -1~+1 | 短期资金流方向 |

**MFI 的关键优势**：既有 RSI 的振荡器结构（有明确的超买/超卖阈值），又融合了成交量信息（能过滤缩量假信号）。

## 2. 完整计算流程

### 2.1 Step 1: Typical Price (典型价格)

$$TP_t = \frac{H_t + L_t + C_t}{3}$$

典型价格比单用收盘价更能代表一根 K 线的"公允价值"。

### 2.2 Step 2: Raw Money Flow (原始资金流)

$$RMF_t = TP_t \times Volume_t$$

这是该周期的"资金流量"——价格越高、成交量越大，资金流越大。

### 2.3 Step 3: 分类为正/负资金流

```
if TP[t] > TP[t-1]:
    Positive Money Flow += RMF[t]    # 资金流入

elif TP[t] < TP[t-1]:
    Negative Money Flow += RMF[t]    # 资金流出

else:
    # TP 不变时，该周期被忽略（不计入正或负）
```

### 2.4 Step 4: Money Flow Ratio (资金流比率)

$$MFR = \frac{\sum_{i=1}^{N} Positive\ Money\ Flow_i}{\sum_{i=1}^{N} Negative\ Money\ Flow_i}$$

标准周期 N = 14。

### 2.5 Step 5: Money Flow Index

$$MFI = 100 - \frac{100}{1 + MFR}$$

等价形式：

$$MFI = \frac{100 \times Positive\ Money\ Flow}{Positive\ Money\ Flow + Negative\ Money\ Flow}$$

### 2.6 计算流程图

```
OHLCV 数据
  │
  ├── Typical Price = (H + L + C) / 3
  │
  ├── Raw Money Flow = TP × Volume
  │
  ├── 分类:
  │     ├── TP↑ → Positive Money Flow
  │     └── TP↓ → Negative Money Flow
  │
  ├── 14 周期求和:
  │     ├── PMF_14 = sum(正资金流, 14)
  │     └── NMF_14 = sum(负资金流, 14)
  │
  ├── Money Flow Ratio = PMF_14 / NMF_14
  │
  └── MFI = 100 - 100/(1 + MFR)
```

### 2.7 与 RSI 计算的对比

| 步骤 | RSI | MFI |
|------|-----|-----|
| 输入 | Close | H, L, C, **Volume** |
| 变化量 | ΔClose | **TP × Volume** |
| 正/负分类 | ΔClose > 0 / < 0 | TP 上升 / 下降 |
| 比率 | Avg Gain / Avg Loss | Sum PMF / Sum NMF |
| 平滑 | **Wilder EMA** | **简单求和**（无平滑） |
| 公式 | 100 - 100/(1+RS) | 100 - 100/(1+MFR) |

关键差异：RSI 使用 Wilder 指数平滑，MFI 使用简单滚动求和。MFI 对近期数据的反应更直接。

## 3. 信号解读

### 3.1 超买/超卖

| MFI 范围 | 状态 | 含义 |
|----------|------|------|
| **> 80** | 超买 | 大量资金流入后市场过热，可能回调 |
| **< 20** | 超卖 | 大量资金流出后市场过冷，可能反弹 |
| 50 ~ 80 | 偏多 | 买方力量占优 |
| 20 ~ 50 | 偏空 | 卖方力量占优 |
| **= 50** | 平衡 | 买卖力量均衡 |

注意：在强趋势中，MFI 可能长期停留在 80+ 或 20- 区域（"钉住"效应），此时超买/超卖信号失效。

### 3.2 背离 (Divergence)

| 类型 | 价格行为 | MFI 行为 | 含义 |
|------|---------|---------|------|
| **看多背离** | 创新低 | 高于前低 | 卖压减弱，可能反转上涨 |
| **看空背离** | 创新高 | 低于前高 | 买压减弱，可能反转下跌 |

MFI 的背离比 RSI 更有价值，因为**量价同时背离**的信号比纯价格背离更可靠。

### 3.3 失败摆动 (Failure Swing)

失败摆动完全不看价格，只看 MFI 自身的形态：

**看多失败摆动：**
1. MFI 跌破 20（超卖）
2. 反弹后回升到 20 以上
3. 回调但守住 20 以上
4. 突破前次反弹高点 → 买入信号

**看空失败摆动：**
1. MFI 升破 80（超买）
2. 回落到 80 以下
3. 反弹但未能突破 80
4. 跌破前次回调低点 → 卖出信号

### 3.4 50 线交叉

- MFI 上穿 50：买方力量占优，趋势偏多
- MFI 下穿 50：卖方力量占优，趋势偏空
- 配合 ADX 趋势过滤使用效果更好

## 4. 应用策略

### 4.1 Strategy 1: 经典超买超卖策略

```
做多条件:
  MFI < 20 (超卖) → 等待 MFI 回升突破 20 → 买入
  止损: MFI 再次跌破 20 或价格破近期低点
  止盈: MFI > 70 或价格达到阻力位

做空条件:
  MFI > 80 (超买) → 等待 MFI 回落跌破 80 → 卖出
  止损: MFI 再次突破 80 或价格破近期高点
  止盈: MFI < 30 或价格达到支撑位
```

**适用环境：** 震荡市 (ADX < 25)。趋势市中超买/超卖信号可靠性大幅下降。

### 4.2 Strategy 2: MFI 背离策略

```
看多背离入场:
  1. 价格创出近 N 天新低
  2. MFI 未创新低（MFI 低点高于前一次价格低点时的 MFI 值）
  3. MFI 从低位回升突破前次反弹高点 → 买入

看空背离入场:
  1. 价格创出近 N 天新高
  2. MFI 未创新高
  3. MFI 从高位回落跌破前次回调低点 → 卖出
```

### 4.3 Strategy 3: MFI + ADX 组合策略

```python
def mfi_adx_strategy(mfi, adx, plus_di, minus_di):
    """
    ADX 决定模式，MFI 提供信号。
    """
    if adx < 20:
        # 震荡市: 使用 MFI 超买超卖
        if mfi < 20:
            return "BUY_OVERSOLD"
        elif mfi > 80:
            return "SELL_OVERBOUGHT"
    elif adx > 25:
        # 趋势市: MFI 作为回调入场信号
        if plus_di > minus_di and mfi < 40:
            return "BUY_PULLBACK"  # 上涨趋势中 MFI 回调
        elif minus_di > plus_di and mfi > 60:
            return "SELL_RALLY"    # 下跌趋势中 MFI 反弹
    return "HOLD"
```

### 4.4 Strategy 4: MFI + RSI 双确认

```
做多条件 (双超卖):
  RSI < 30 AND MFI < 20
  → 价格超卖 + 资金流超卖双确认 → 强买入信号

做空条件 (双超买):
  RSI > 70 AND MFI > 80
  → 价格超买 + 资金流超买双确认 → 强卖出信号
```

双确认能大幅减少假信号，因为 RSI 和 MFI 使用不同信息源（纯价格 vs 价量）。

### 4.5 Strategy 5: MFI 量价确认过滤器

将 MFI 作为其他策略的**量价确认层**：

```python
def volume_confirm(signal, mfi):
    """
    任何买入信号都需要 MFI > 50 确认（资金流入）。
    任何卖出信号都需要 MFI < 50 确认（资金流出）。
    """
    if signal == "BUY" and mfi > 50:
        return "CONFIRMED_BUY"
    elif signal == "SELL" and mfi < 50:
        return "CONFIRMED_SELL"
    else:
        return "REJECTED"  # 量价不一致，信号可疑
```

### 4.6 Strategy 6: 完整的多指标框架

```python
def full_framework(mfi, rsi, adx, plus_di, minus_di, hurst, bb_pct):
    """
    Hurst   → 选择 regime (趋势 vs 震荡)
    ADX     → 确认趋势强度
    MFI/RSI → 提供入场时机
    BB      → 提供价格极值参考
    """
    if hurst > 0.55 and adx > 25:
        # 趋势 regime
        if plus_di > minus_di:
            if mfi < 40 and bb_pct < 0.3:
                return "TREND_BUY_PULLBACK"
        else:
            if mfi > 60 and bb_pct > 0.7:
                return "TREND_SELL_RALLY"

    elif hurst < 0.45 and adx < 20:
        # 均值回归 regime
        if mfi < 20 and rsi < 30:
            return "REVERSION_BUY"
        elif mfi > 80 and rsi > 70:
            return "REVERSION_SELL"

    return "NO_SIGNAL"
```

## 5. 注意事项与局限性

### 5.1 强趋势中的失效

在单边强势行情中，MFI 会长期停留在 80+ 或 20- 区域：
- 上涨趋势中 MFI > 80 可能持续数周——此时做空会被反复止损
- 下跌趋势中 MFI < 20 可能持续数周——此时抄底很危险

**解决方案：** 配合 ADX 判断趋势。ADX > 25 时不使用超买超卖信号。

### 5.2 成交量质量

MFI 依赖成交量数据的质量：
- **外汇市场**：没有真实的集中成交量，只有 tick volume（报价变动次数），MFI 的参考价值打折
- **期货市场**：有真实成交量，MFI 信号可靠
- **股票市场**：有真实成交量，MFI 最适用
- **加密货币**：成交量可能被刷量，需谨慎

### 5.3 周期选择

| 周期 | 特点 | 适用 |
|------|------|------|
| **7** | 灵敏但噪声大 | 日内 / 短线 |
| **14** | 标准设置，平衡灵敏度和噪声 | 日线波段 |
| **21** | 更平滑，信号少 | 周线 / 中线 |

### 5.4 MFI = 0 或 100 的极端情况

- **MFI = 100**：过去 14 个周期全部是正资金流（TP 持续上升）—— 极其罕见，通常只在暴涨中出现
- **MFI = 0**：过去 14 个周期全部是负资金流——极其罕见，通常只在暴跌中出现
- 这些极值出现时往往不是反转信号，而是极端动量的体现

### 5.5 与 RSI 的信号差异

当 MFI 和 RSI 给出不同信号时，特别值得关注：
- **RSI 超买但 MFI 不超买**：价格涨了但没有成交量配合 → 上涨可能不可持续
- **RSI 不超卖但 MFI 超卖**：成交量异常集中在卖方 → 可能有机构大量出货
- **RSI 和 MFI 同时超买/超卖**：最强的反转信号

## 6. 核心参考文献

1. Quong, G. & Soudack, A. (1989). "Volume-Weighted RSI: Money Flow Index." *Technical Analysis of Stocks & Commodities*, 7(3).
2. Murphy, J.J. (1999). *Technical Analysis of the Financial Markets*. New York Institute of Finance.
3. Achelis, S.B. (2001). *Technical Analysis from A to Z* (2nd ed.). McGraw-Hill.

## 7. 总结

| 维度 | 结论 |
|------|------|
| **计算复杂度** | 低——4 步简单计算，无复杂平滑 |
| **核心价值** | 引入成交量维度的动量振荡器，解决 RSI 忽略量的问题 |
| **最佳用途** | 震荡市中的超买超卖 + 量价背离检测 |
| **最大局限** | 强趋势中超买/超卖信号失效；依赖成交量数据质量 |
| **最佳组合** | MFI (量价动量) + ADX (趋势过滤) + Hurst (regime 选择) |
| **关键原则** | MFI 超买/超卖用于震荡市，MFI 回调用于趋势市 |
