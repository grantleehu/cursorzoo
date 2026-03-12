# Transformer 在价格/收益率序列信号提取中的应用 调研报告

## 1. 核心问题

> Transformer 能从价格或收益率序列中提取到什么规律？

**诚实的答案：可以提取到一些规律，但提取到的信号极弱、实盘获利极难。**

金融时间序列的本质问题是**信噪比极低** (SNR ~ 0.01 量级)：
- 自然语言中，"猫坐在垫子上" 的下一个词有 80%+ 的可预测性
- 金融收益率中，明天涨跌的可预测性可能只有 51% vs 49%
- Transformer 的强大能力用在这里，像是用航母打蚊子——模型足够强大，但信号本身就不多

以下是诚实、系统的梳理。

## 2. Transformer 能提取到的规律

### 2.1 已有证据支持的规律

| 规律类型 | Transformer 如何提取 | 证据强度 | 代表工作 |
|----------|---------------------|---------|---------|
| **动量与反转** | Attention 权重学习到过去收益率对未来的影响模式 | ⭐⭐⭐ | Momentum Transformer (Oxford, 2021) |
| **波动率聚集** | Multi-head attention 捕捉不同时间尺度的方差持续性 | ⭐⭐⭐ | 多项高频数据研究 |
| **Regime 切换** | Attention 权重在市场转折点自动重新分配 | ⭐⭐⭐ | Momentum Transformer 在 COVID 期间自适应 |
| **跨资产 Lead-Lag** | Cross-attention 学习资产间的领先-滞后关系 | ⭐⭐ | Correlated Attention (IBM, 2025) |
| **量价关系** | 将成交量作为额外特征，attention 学习价量交互 | ⭐⭐ | Stockformer (2024) |
| **因子非线性交互** | Self-attention 自动发现因子间的高阶交互效应 | ⭐⭐ | HRFT (2024), STORM (2024) |
| **日内微观结构** | 高频数据中的 order flow imbalance, bid-ask dynamics | ⭐⭐ | 高频 Transformer 研究 |

### 2.2 有争议或未充分验证的

| 规律类型 | 问题 |
|----------|------|
| **精确价格预测** | 预测误差通常 > 交易成本，无法获利 |
| **长期趋势预测** | Transformer 擅长序列建模，但金融长期趋势受基本面驱动，纯价格信号不够 |
| **Black Swan 预警** | 极端事件样本太少，Transformer 学不到 |

### 2.3 关键洞察

Transformer 在金融中最有价值的不是**预测价格**，而是：

1. **学习自适应的权重分配**：哪些历史时刻对当前最重要（attention 的本质）
2. **学习多尺度模式**：multi-head attention 可以同时关注短期动量和长期均值回归
3. **学习跨资产结构**：cross-attention 发现资产间的动态关系
4. **学习非线性因子组合**：替代传统的线性因子模型

## 3. 代表性架构与研究

### 3.1 Momentum Transformer (Oxford-Man Institute, 2021)

**最值得关注的金融 Transformer 工作之一。**

```
架构: LSTM encoder + Multi-head Self-Attention + 直接优化 Sharpe Ratio
输入: 多资产的历史收益率、波动率等时序因子
输出: 每个资产的仓位权重 (连续值, -1 ~ +1)
```

**核心发现：**
- Attention 权重在动量转折点处出现峰值 → 模型学到了 regime change
- 不同的 attention head 关注不同时间尺度 → 同时捕获短期反转和长期动量
- COVID 崩盘期间自动减仓 → 传统 LSTM 做不到这种快速适应
- Sharpe Ratio 提升 > 100% vs 基准时序动量策略

**为什么它 work：**
- 不预测价格，直接优化交易目标（Sharpe Ratio）
- 输入是因子（不是原始价格），降低了噪声
- 多资产联合建模，利用跨资产信息

**GitHub:** `kieranjwood/trading-momentum-transformer`

### 3.2 Temporal Fusion Transformer (Google, 2021)

```
架构: Variable Selection + LSTM encoder + Multi-head Attention + Gating
输入: 静态变量 + 已知未来变量 + 观测时序变量
输出: 多步概率预测 (分位数)
特色: 高度可解释 — 输出 feature importance 和 attention 权重
```

**金融应用：**
- 多指数价格预测 (S&P 500, Nasdaq, IBEX 35, Dow Jones)
- TFT 的 Variable Selection Network 自动给出每个输入特征的重要性
- 可直接看到模型认为哪些技术指标最有用
- 基于 TFT 的 Momentum Rebalancing 策略在商品期货上获得了合理的 Sharpe

**最大价值**：可解释性——你能看到模型学到了什么，而不是黑盒。

### 3.3 Stockformer (2024)

```
架构: 小波分解 + Graph Embedding + Multi-task Self-Attention
输入: 多只股票的价量数据
输出: 收益率预测 + 涨跌方向预测 (双任务)
特色: 小波分解将信号拆为低频趋势和高频波动
```

**核心发现：**
- 小波去噪后再用 Transformer 效果显著提升（直接用原始价格效果差）
- Graph embedding 捕捉股票间的关系（行业、供应链）
- 双任务学习比单任务更稳定

### 3.4 HRFT — 高频因子挖掘 (2024)

```
思路: 将因子公式的符号表达视为一种"语言"
方法: 训练 Transformer 生成因子公式 (如 "rank(corr(volume, close, 5))")
结果: 自动发现的因子在 HS300 和 S&P500 上收益提升 30%
```

这是一个非常有创意的方向——不用 Transformer 直接预测价格，而是用它来**自动发现 alpha 因子公式**。

### 3.5 时序基础模型 (Foundation Models)

| 模型 | 开发方 | 参数量 | 特点 | 金融适用性 |
|------|-------|-------|------|-----------|
| **TimesFM 2.5** | Google | 200M | Decoder-only, 16k context | 中——通用模型，需 fine-tune |
| **Chronos-2** | Amazon | 120M | 最成熟的通用 TSFM | 中——zero-shot 对金融数据效果一般 |
| **Moirai 2.0** | Salesforce | 14M~311M | 概率预测, 不确定性量化 | 较高——金融需要不确定性估计 |
| **TimeGPT** | Nixtla | — | API 服务 | 低——黑盒，不适合量化研究 |

**现状评估：** 这些基础模型在气象、零售等领域表现出色，但在金融数据上通常不如 domain-specific 的方法。原因是金融数据的统计特性与它们的训练分布差异很大（厚尾、低信噪比、非平稳）。

## 4. 重要争议："Transformer 真的有效吗？"

### 4.1 DLinear 挑战

2022 年 AAAI 论文 "Are Transformers Effective for Time Series Forecasting?" 提出了尖锐质疑：

- **一层线性模型 (DLinear) 在 9 个数据集上打败了所有 Transformer 变体**
- 包括 Informer, Autoformer, FEDformer 等当时 SOTA 的模型
- 原因分析：Self-attention 的 permutation invariance 破坏了时序的顺序信息

### 4.2 Attention 退化问题

2025 年的研究进一步发现：
- 时间序列 Transformer 中的 attention 机制经常**退化为 MLP**
- 即 attention 权重趋向均匀分布，没有真正学到有意义的时序模式
- 根本原因：当前的 embedding 方法无法为时间序列创建结构化的 latent space

### 4.3 53.7% 准确率但亏钱的案例

一个广为流传的实践案例：
- 训练 Transformer 预测股票涨跌，达到 53.7% 准确率
- 看起来超过随机 (50%)，但实际交易亏损
- 原因：模型在小幅波动时准确，但在大幅波动时犯错——而收益主要来自大幅波动

### 4.4 学术 vs 实盘的鸿沟

| 学术论文报告 | 实盘现实 |
|------------|---------|
| 方向预测准确率 52~55% | 扣除交易成本后不赚钱 |
| 回测 Sharpe > 1.5 | 样本外 Sharpe < 0.5 |
| RMSE 降低 20% | 20% 的 RMSE 改善对应 < 1% 的收益率差异 |
| "显著优于 LSTM" | p-value 可疑，数据窥探严重 |

## 5. 什么场景下 Transformer 真正有用

### 5.1 有用的场景 ✓

| 场景 | 为什么有用 | 推荐方法 |
|------|-----------|---------|
| **多资产组合的仓位优化** | 跨资产 attention 学习动态相关性 | Momentum Transformer |
| **因子发现/因子组合** | 自动搜索非线性因子交互 | HRFT, 因子 Transformer |
| **高频微观结构** | 数据量大、模式更确定 | 专用高频 Transformer |
| **另类数据融合** | 整合新闻、财报、技术指标等多模态输入 | TFT, Multimodal Transformer |
| **波动率/风险预测** | 波动率的可预测性远高于收益率 | 各类 Transformer 架构 |
| **Regime 检测** | Attention 自动发现 regime 边界 | Momentum Transformer |

### 5.2 不太有用的场景 ✗

| 场景 | 为什么不行 |
|------|-----------|
| **纯价格→预测价格** | 信噪比太低；DLinear 可能更好 |
| **单一资产短期方向预测** | 信号太弱，交易成本吃掉微弱优势 |
| **Zero-shot 基础模型直接用于金融** | 训练分布不匹配 |
| **日频少量数据** | Transformer 需要大数据，数百个交易日不够 |

### 5.3 核心原则

```
不要用 Transformer 去预测价格。
用 Transformer 去做这些事：
  1. 学习自适应的特征权重 (什么时候什么因子重要)
  2. 学习资产间的动态关系 (cross-attention)
  3. 学习非线性的因子组合 (替代线性模型)
  4. 直接优化交易目标 (Sharpe, PnL) 而非预测误差
```

## 6. 实践建议

### 6.1 输入设计

```
❌ 错误做法: 直接用原始价格序列作为输入
✓ 正确做法:

输入 = [
    # 收益率 (去除价格的非平稳性)
    log_returns_1d, log_returns_5d, log_returns_20d,

    # 已有的技术指标/因子 (提供领域知识)
    rsi_14, mfi_14, adx_14,
    hurst_50, realized_vol_20,

    # 横截面信息 (如果多资产)
    sector_id, market_cap_rank,

    # 另类数据 (如果可用)
    news_sentiment, earnings_surprise,
]
```

**关键：用因子而非原始价格。** 因子已经浓缩了领域知识，Transformer 只需要学习因子间的交互和时变权重。

### 6.2 目标函数设计

```
❌ MSE(predicted_price, actual_price)    # 回归误差，与盈利无关
❌ CrossEntropy(predicted_dir, actual_dir)  # 方向准确率，忽略幅度

✓ -Sharpe_Ratio(positions × returns)     # 直接优化风险调整收益
✓ -Sortino_Ratio(positions × returns)    # 只惩罚下行风险
✓ Quantile_Loss(predicted_quantiles)     # 概率预测，捕捉不确定性
```

### 6.3 架构选择指南

```
任务是什么?
│
├── 多资产仓位优化
│     → Momentum Transformer (attention on assets × time)
│
├── 单资产多因子选股
│     → TFT (可解释，feature importance)
│     → Stockformer (价量因子 + 小波去噪)
│
├── 因子公式自动发现
│     → HRFT (Transformer as factor generator)
│     → LLM + MCTS (语言模型辅助因子搜索)
│
├── 波动率/风险预测
│     → Moirai (概率预测 + 不确定性)
│     → TFT (多步分位数预测)
│
└── 作为 baseline / 快速实验
      → DLinear (先用简单线性模型建立 baseline)
      → 如果 DLinear 都不 work，Transformer 大概率也不 work
```

### 6.4 防过拟合核心措施

| 措施 | 说明 |
|------|------|
| **Walk-forward validation** | 绝对不能用未来数据；按时间严格划分 train/val/test |
| **Purged cross-validation** | 训练集和测试集之间留 gap，避免信息泄漏 |
| **多市场/多时期验证** | 不同市场、不同年份都要测试 |
| **交易成本纳入** | 从一开始就在目标函数中扣除手续费和滑点 |
| **Baseline 对比** | 永远和 Buy&Hold、DLinear、简单均线策略对比 |
| **参数量控制** | 金融数据少，模型不宜太大；几万到几十万参数就够 |
| **Early stopping** | 基于验证集的 Sharpe 而非 loss |

### 6.5 推荐的实践路径

```
Phase 1: 建立 Baseline (1-2 周)
  - 准备因子数据 (技术指标、基本面)
  - 用 DLinear / Ridge Regression 建立 baseline
  - 记录 baseline 的 Sharpe、最大回撤、胜率

Phase 2: 简单 Transformer (2-4 周)
  - 用 TFT 或简单的 Encoder-only Transformer
  - 输入: 因子特征 (非原始价格)
  - 目标: 直接优化 Sharpe Ratio
  - 对比是否超过 baseline

Phase 3: 进阶 (如果 Phase 2 有效)
  - 加入 cross-attention (多资产)
  - 加入另类数据 (新闻、财报)
  - 尝试 Momentum Transformer 架构
  - 严格的 out-of-sample 验证

Phase 4: 生产化
  - Online learning / incremental update
  - 实时风控和仓位管理
  - 持续监控模型衰退 (model decay)
```

## 7. 代表性论文列表

### 7.1 核心论文 (必读)

| 论文 | 年份 | 核心贡献 |
|------|------|---------|
| **Trading with the Momentum Transformer** (Wood, Zohren, Roberts) | 2021 | 金融 Transformer 的标杆；Attention 可解释性；直接优化 Sharpe |
| **Temporal Fusion Transformers** (Lim, Zohren, et al., Google) | 2021 | 可解释的多步预测；Variable Selection 机制 |
| **Are Transformers Effective for Time Series Forecasting?** (Zeng et al.) | 2022 | DLinear 挑战 Transformer；重要的 reality check |
| **A Time Series is Worth 64 Words (PatchTST)** (Nie et al.) | 2023 | Patch-based tokenization；Channel independence |

### 7.2 金融特化论文

| 论文 | 年份 | 核心贡献 |
|------|------|---------|
| **Stockformer** (2024) | 2024 | 小波去噪 + 图嵌入 + 多任务 Attention |
| **HRFT: High-Frequency Risk Factor Mining** | 2024 | 将因子挖掘视为语言建模问题 |
| **STORM: Spatio-Temporal Factor Model** | 2024 | VQ-VAE + Transformer 的因子提取 |
| **Deep Momentum Networks** (Lim, Zohren) | 2019 | Momentum Transformer 的前身 |

### 7.3 批判性论文

| 论文 | 年份 | 核心观点 |
|------|------|---------|
| **Why Attention Fails** (2025) | 2025 | Attention 在时序中退化为 MLP |
| **Transformers Lose to Linear Models** (多个后续研究) | 2023-24 | DLinear 挑战的系统性验证 |

## 8. 开源资源

| 资源 | 链接 | 说明 |
|------|------|------|
| **Momentum Transformer** | `kieranjwood/trading-momentum-transformer` | Oxford 论文的官方实现 |
| **PyTorch Forecasting (TFT)** | `jdb78/pytorch-forecasting` | TFT 的 PyTorch 实现 |
| **FinGPT** | `AI4Finance-Foundation/FinGPT` | 金融 LLM 开源框架 |
| **FinRL** | `AI4Finance-Foundation/FinRL` | 金融强化学习 + DL |
| **TSFM.ai** | `tsfm.ai` | 统一的时序基础模型 API |
| **TimesFM** | `google-research/timesfm` | Google 时序基础模型 |
| **TSLib** | `thuml/Time-Series-Library` | 清华大学时序模型库 (含所有主流 Transformer) |

## 9. 总结

### 9.1 一句话回答

> Transformer 能从价格/收益率序列中提取到**动量/反转模式、regime 切换、波动率聚集、跨资产 lead-lag 关系**等规律，但这些规律的**信号强度极弱**，直接用于交易获利的证据有限。

### 9.2 关键结论

| 结论 | 详情 |
|------|------|
| **最有价值的应用** | 因子权重的时变学习、跨资产关系建模、regime 检测 |
| **最没价值的应用** | 直接用原始价格预测未来价格 |
| **DLinear 是必要的 baseline** | 如果简单线性模型都不 work，Transformer 大概率也不 work |
| **信号 > 模型** | 好的输入特征（因子）比好的模型架构重要 10 倍 |
| **优化目标很关键** | 直接优化 Sharpe Ratio，而非 MSE |
| **过拟合是头号敌人** | 金融数据少、噪声大、分布变化快 → 极易过拟合 |
| **可解释性是加分项** | TFT、Momentum Transformer 的可解释性有实际价值 |
| **波动率比价格好预测** | 如果目标是风险管理而非 alpha 生成，Transformer 更有用 |

### 9.3 最终建议

```
对于价格/收益率序列:
  - 先用传统方法 (Hurst, ADX, MFI 等技术指标) 提取因子
  - 再用 Transformer 学习因子的时变权重和交互
  - 不要跳过 DLinear baseline
  - 直接优化交易目标，不要优化预测精度
  - 对任何 "准确率 > 55%" 的结果保持怀疑
  - 最有前景的方向: Momentum Transformer (多资产) 和 HRFT (因子发现)
```
