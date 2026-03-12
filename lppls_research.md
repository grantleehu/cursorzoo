# LPPLS 信号分析应用 调研报告

## 1. 概述

**LPPLS (Log-Periodic Power Law Singularity)** 模型由 Didier Sornette 等人提出，是目前学术界和量化领域最成熟的**金融泡沫检测框架**。其核心思想是：

> 金融泡沫不是随机产生的，而是由投资者之间的**正反馈 (herding)** 和**模仿行为**内生驱动的。泡沫期间，价格以**超指数 (faster-than-exponential)** 方式增长，同时伴随**加速振荡**，最终在一个有限时间奇点 (critical time, tc) 处结束。

LPPLS 模型不预测泡沫"一定会破裂"，而是给出泡沫破裂的**最可能时间窗口**和**概率估计**。

## 2. 数学模型

### 2.1 核心公式

LPPLS 模型描述对数价格的期望行为：

$$E[\ln p(t)] = A + B(t_c - t)^m + C(t_c - t)^m \cos(\omega \ln(t_c - t) - \phi)$$

等价地，使用 $c_1, c_2$ 替代 $C, \phi$：

$$E[\ln p(t)] = A + (t_c - t)^m \left[ B + c_1 \cos(\omega \ln(t_c - t)) + c_2 \sin(\omega \ln(t_c - t)) \right]$$

其中 $C = \sqrt{c_1^2 + c_2^2}$，$\phi = \arctan(c_2 / c_1)$。

### 2.2 参数含义

| 参数 | 范围约束 | 物理意义 |
|------|---------|---------|
| **A** | > max(price) | 对数价格在 tc 时刻的理论值（泡沫峰值） |
| **B** | < 0 (正向泡沫) | 幂律增长的幅度；B < 0 意味着价格在接近 tc 时上升 |
| **C** (或 c1, c2) | \|C\| ∈ (0, 1) | 对数周期振荡的幅度 |
| **tc** | > t_last | **临界时间**——泡沫最可能结束的时刻 |
| **m** | (0.1, 0.9) | 幂律指数；m < 1 保证超指数增长；m 越小增长越剧烈 |
| **ω** | (4.8, 13) | 对数周期振荡频率；约束防止过拟合或伪振荡 |
| **φ** | [0, 2π] | 相位 |

### 2.3 模型的直觉解读

LPPLS 公式包含三个叠加成分：

1. **常数项 A**：代表泡沫峰值的对数价格
2. **幂律项 B(tc-t)^m**：描述超指数增长——价格增速本身在加速
3. **对数周期项 C(tc-t)^m cos(ω ln(tc-t) - φ)**：描述加速振荡——随着 tc 临近，波动频率越来越高（在对数时间尺度上等间距）

三者结合，刻画了泡沫的典型特征：**涨得越来越快，波动越来越密，直到不可持续**。

### 2.4 正向泡沫 vs 负向泡沫

| 类型 | B 的符号 | 价格行为 | 结束方式 |
|------|---------|---------|---------|
| **正向泡沫 (Positive Bubble)** | B < 0 | 超指数上涨 | 崩盘 (crash) |
| **负向泡沫 (Negative Bubble)** | B > 0 | 超指数下跌 | 反弹 (rally) |

## 3. 参数估计方法

### 3.1 半解析法（Slaving Principle）

LPPLS 模型有 7 个参数，但可以利用**线性-非线性分离**：

- **非线性参数** (3个)：tc, m, ω —— 需要非线性优化
- **线性参数** (4个)：A, B, c1, c2 —— 给定 tc, m, ω 后，通过最小二乘法解析求解

这种分离将 7 维优化降为 3 维，大幅提升效率和收敛性。

### 3.2 优化算法

| 算法 | 特点 | 适用场景 |
|------|------|---------|
| **Nelder-Mead** | scipy 默认的单纯形法，无需梯度 | 快速初步拟合 |
| **Levenberg-Marquardt** | 非线性最小二乘经典方法 | 接近最优解时精细调整 |
| **CMA-ES** | 协方差矩阵自适应进化策略，全局优化 | 最鲁棒，但最慢 |
| **Tabu Search + LM** | 先用 Tabu 搜索找好初始点，再用 LM 精调 | 文献推荐 |

### 3.3 多次随机初始化

由于 LPPLS 的目标函数有**大量局部极小值**，单次优化几乎必然陷入局部最优。标准做法：

- 对 (tc, m, ω) 进行 **25 次随机初始化** (文献推荐)
- 每次从约束范围内均匀采样初始值
- 取最优结果

## 4. LPPLS 置信度指标 (Confidence Indicator)

### 4.1 核心思想

单次 LPPLS 拟合结果不可靠（对窗口选择极其敏感）。Sornette 提出**多尺度嵌套拟合**方法，构建置信度指标：

> 如果在**多个不同时间窗口**上都能稳定地拟合出满足约束条件的 LPPLS 模型，则泡沫信号更可信。

### 4.2 计算流程

```
对于时间序列中的每个分析时点 t2:

1. 固定 t2 (窗口右端点)
2. 设定最大窗口 W_max 和最小窗口 W_min
3. 从 W_max 开始，逐步缩小窗口到 W_min (步长 = inner_increment)
4. 对每个窗口 [t1, t2]，拟合 LPPLS 模型，得到参数 (tc, m, ω, A, B, C, ...)
5. 对每次拟合结果，检查是否满足过滤条件

Confidence = 满足条件的拟合次数 / 总拟合次数
```

### 4.3 过滤条件 (Filter Conditions)

一次 LPPLS 拟合被判定为"合格"需要同时满足：

| 条件 | 约束 | 目的 |
|------|------|------|
| **tc 在合理范围** | max(t2-60, t2-0.5×Δt) < tc < min(t2+252, t2+0.5×Δt) | tc 不能离当前太远 |
| **m 在范围内** | 0 < m < 1 | 保证超指数行为 |
| **ω 在范围内** | 2 < ω < 15 | 防止伪振荡和过拟合 |
| **振荡次数 O** | O > 2.5 | 保证至少有 2.5 个完整振荡周期 |
| **阻尼比 D** | D > 0.5 | 确保幂律趋势主导，振荡不过强 |

其中：
- $O = \frac{\omega}{2\pi} \ln\frac{t_c - t_1}{t_c - t_2}$ （观测窗口内的振荡次数）
- $D = \frac{m|B|}{\omega|C|}$ （幂律增长 vs 振荡的相对强度）

### 4.4 正/负泡沫分类

- **B < 0** 的合格拟合 → 累积为**正向泡沫置信度 (pos_conf)**
- **B > 0** 的合格拟合 → 累积为**负向泡沫置信度 (neg_conf)**

### 4.5 信号解读

| 置信度水平 | 含义 |
|-----------|------|
| **> 0.5** | 较强的泡沫信号 |
| **> 0.7** | 非常强的泡沫信号，高度警惕 |
| **持续上升** | 泡沫正在加速形成 |
| **突然下降** | 泡沫可能已经破裂或结构发生变化 |

## 5. Python 实现

### 5.1 使用 lppls 库

```bash
pip install -U lppls
```

#### 5.1.1 单次拟合

```python
from lppls import lppls, data_loader
import numpy as np
import pandas as pd
from datetime import datetime as dt

# 加载内置的 NASDAQ 互联网泡沫数据
data = data_loader.nasdaq_dotcom()

# 转为 ordinal 时间戳
time = [pd.Timestamp.toordinal(dt.strptime(t, '%Y-%m-%d')) for t in data['Date']]
price = np.log(data['Adj Close'].values)
observations = np.array([time, price])

# 实例化并拟合
model = lppls.LPPLS(observations=observations)
tc, m, w, a, b, c, c1, c2, O, D = model.fit(max_searches=25)

print(f"tc = {dt.fromordinal(int(tc)).strftime('%Y-%m-%d')}")
print(f"m = {m:.4f}, ω = {w:.4f}")
print(f"B = {b:.4f} ({'正向泡沫' if b < 0 else '负向泡沫'})")
print(f"O = {O:.2f} 振荡, D = {D:.2f} 阻尼比")

# 可视化拟合
model.plot_fit()
```

#### 5.1.2 多尺度置信度指标 (多进程)

```python
# 计算嵌套拟合 (耗时较长)
res = model.mp_compute_nested_fits(
    workers=4,
    window_size=120,          # 最大窗口 (交易日)
    smallest_window_size=30,  # 最小窗口
    outer_increment=5,        # 外层滑动步长
    inner_increment=5,        # 内层缩窗步长
    max_searches=25,          # 每次拟合的随机搜索次数
)

# 计算并绘制置信度指标
model.plot_confidence_indicators(res)
```

#### 5.1.3 Lagrange 正则化检测泡沫起始时间

```python
result = model.detect_bubble_start_time_via_lagrange(
    max_window_size=250,
    min_window_size=50,
    step_size=5,
    max_searches=25,
)

if result:
    tau = dt.fromordinal(int(result['tau']))
    tc = dt.fromordinal(int(result['tc']))
    print(f"泡沫起始时间 τ = {tau.strftime('%Y-%m-%d')}")
    print(f"泡沫临界时间 tc = {tc.strftime('%Y-%m-%d')}")
    print(f"最优窗口大小 = {result['optimal_window_size']} 天")
```

### 5.2 手写 LPPLS 核心实现

```python
import numpy as np
from scipy.optimize import minimize

def lppls_func(t, tc, m, w, a, b, c1, c2):
    """LPPLS model function."""
    dt = np.abs(tc - t) + 1e-8
    return a + np.power(dt, m) * (
        b + c1 * np.cos(w * np.log(dt)) + c2 * np.sin(w * np.log(dt))
    )

def solve_linear_params(t, price, tc, m, w):
    """Given nonlinear params (tc, m, w), solve linear params (a, b, c1, c2)."""
    dt = np.abs(tc - t) + 1e-8
    fi = np.power(dt, m)
    gi = fi * np.cos(w * np.log(dt))
    hi = fi * np.sin(w * np.log(dt))

    # Build 4x4 system: [1, fi, gi, hi] @ [a, b, c1, c2]^T = price
    X = np.column_stack([np.ones_like(t), fi, gi, hi])
    XtX = X.T @ X + 1e-8 * np.eye(4)
    Xty = X.T @ price
    params = np.linalg.solve(XtX, Xty)
    return params  # [a, b, c1, c2]

def lppls_objective(x, t, price):
    """Objective: sum of squared residuals (only optimize tc, m, w)."""
    tc, m, w = x
    a, b, c1, c2 = solve_linear_params(t, price, tc, m, w)
    fitted = lppls_func(t, tc, m, w, a, b, c1, c2)
    return np.sum((price - fitted) ** 2)

def fit_lppls(t, price, max_searches=25):
    """Fit LPPLS with multiple random initializations."""
    t1, t2 = t[0], t[-1]
    best_sse = np.inf
    best_params = None

    for _ in range(max_searches):
        tc0 = np.random.uniform(t2 - 0.2*(t2-t1), t2 + 0.2*(t2-t1))
        m0 = np.random.uniform(0.1, 0.9)
        w0 = np.random.uniform(6.0, 13.0)

        try:
            result = minimize(
                lppls_objective, x0=[tc0, m0, w0],
                args=(t, price), method='Nelder-Mead',
                options={'maxiter': 5000}
            )
            if result.fun < best_sse:
                best_sse = result.fun
                tc, m, w = result.x
                a, b, c1, c2 = solve_linear_params(t, price, tc, m, w)
                best_params = (tc, m, w, a, b, c1, c2)
        except Exception:
            continue

    return best_params
```

## 6. 实际应用场景

### 6.1 实时泡沫监测

**ETH Zurich Financial Crisis Observatory (FCO)** 由 Sornette 领导，自 2014 年持续运营，对全球主要资产进行 LPPLS 实时监测，发布 "Global Bubble Status Report"。

典型工作流：
```
每日收盘后:
  1. 获取最新价格数据
  2. 对多个窗口大小计算 LPPLS 嵌套拟合
  3. 计算 pos_conf 和 neg_conf
  4. 与历史置信度时间序列对比
  5. 若 conf > 阈值且持续上升 → 发出预警
```

### 6.2 成功案例

| 事件 | LPPLS 表现 |
|------|-----------|
| **2000 互联网泡沫** | 1999 年底 pos_conf 持续 > 0.7，tc 指向 2000 年 Q1 |
| **2008 次贷危机** | S&P 500 在 2007 年中出现显著 LPPLS 信号 |
| **2015 中国 A 股** | CSI 300 在 2015 年初 pos_conf 快速攀升 |
| **2021 Bitcoin** | 识别出两个不同性质的泡沫阶段 (内生 + 外生) |
| **2021-2022 S&P 500** | 2021 年底检测到系统性不稳定，2022 年 1 月开始大幅回调 |

### 6.3 策略集成

#### 6.3.1 风险管理 / 仓位调整

```
if pos_conf > 0.5 and pos_conf rising:
    # 泡沫正在形成，但还在涨
    减少多头敞口至 50%
    买入 OTM put 对冲

if pos_conf > 0.7 and tc - today < 60:
    # 临界时间 < 60天，高危
    减仓至 20%
    增加 put 保护

if neg_conf > 0.5:
    # 负向泡沫，市场可能过度恐慌
    准备抄底，逐步建仓
```

#### 6.3.2 与 Hurst 指数结合

| Hurst H | LPPLS pos_conf | 市场状态 | 策略 |
|---------|----------------|---------|------|
| H > 0.6 | > 0.5 | 趋势加速 + 泡沫信号 | 跟随但做好对冲 |
| H > 0.6 | < 0.2 | 健康趋势 | 趋势跟踪 |
| H < 0.45 | > 0.5 | 波动加剧 + 泡沫末期 | 大幅减仓 |
| H ≈ 0.5 | < 0.2 | 随机市 | 低仓位 / 波动率策略 |

#### 6.3.3 多资产监测

同时对多个相关资产跑 LPPLS：
- 如果**多个资产同时**出现泡沫信号 → 系统性风险上升
- 如果**单一资产**出现信号 → 个体泡沫，可用配对/对冲策略

### 6.4 多时间尺度分析

| 尺度 | 窗口范围 (交易日) | 捕捉内容 |
|------|------------------|---------|
| **短期** | 30 ~ 120 | 周级别到季度级别的投机泡沫 |
| **中期** | 120 ~ 500 | 半年到两年的结构性泡沫 |
| **长期** | 500 ~ 2000 | 数年级别的宏观泡沫 |

## 7. 注意事项与局限性

### 7.1 计算成本

嵌套拟合的计算量极大：

```
总拟合次数 ≈ (N / outer_increment) × ((W_max - W_min) / inner_increment) × max_searches

例如: (1000/5) × ((120-30)/5) × 25 = 90,000 次非线性优化
```

**缓解措施：** 多进程并行 (mp_compute_nested_fits)；增大 outer/inner_increment (牺牲分辨率)；使用 CMA-ES 替代多次 Nelder-Mead。

### 7.2 过拟合风险

- LPPLS 有 7 个自由参数，足以拟合几乎任何短期价格走势
- **过滤条件是核心**——只有通过 tc/m/ω/O/D 约束的拟合才计入置信度
- 建议对拟合残差做平稳性检验 (KPSS/ADF)

### 7.3 tc 的不确定性

- tc 不是"预测崩盘的精确日期"，而是一个**概率分布最密集的区域**
- 实际崩盘可能在 tc 之前或之后发生
- 应将 tc 视为"高风险窗口"而非精确预报

### 7.4 假阳性

- 泡沫信号不等于"一定崩盘"——泡沫可以被外部因素 (如央行干预) 暂时延缓
- pos_conf 上升后回落是常见情况
- 建议配合其他指标 (基本面估值、情绪指标、流动性指标) 交叉验证

### 7.5 数据要求

- 最少需要 **30-50 个交易日** 的数据才能拟合
- 可靠的置信度指标需要 **200+ 天**的数据
- 日频数据最常用；高频数据 (小时/分钟) 可用于短期检测但噪声更大

### 7.6 模型假设

- 假设泡沫是**内生驱动**的——如果崩盘完全由外部冲击引起 (如疫情)，LPPLS 未必能提前检测
- 假设对数周期振荡存在——并非所有泡沫都表现出清晰的 log-periodicity

## 8. 与其他泡沫检测方法的对比

| 方法 | 原理 | 优势 | 劣势 |
|------|------|------|------|
| **LPPLS** | 超指数增长 + 对数周期振荡 | 有理论模型支撑；给出 tc 估计 | 计算量大；参数多 |
| **SADF / GSADF** (Phillips et al.) | 递归右尾 ADF 检验，检测爆炸性行为 | 统计检验框架严格 | 不给出 tc；只检测"是否有泡沫" |
| **Regime Switching** | 马尔可夫转换模型 | 可建模多种 regime | 不特异于泡沫 |
| **Hurst Exponent** | 长程依赖 / 持久性 | 简单快速 | 不直接对应泡沫；H > 0.5 不等于泡沫 |
| **估值比率** (P/E, CAPE) | 基本面偏离 | 直觉清晰 | 极慢的信号；无法给出时间预测 |

## 9. 核心参考文献

1. Sornette, D. (2003). *Why Stock Markets Crash: Critical Events in Complex Financial Systems*. Princeton University Press.
2. Johansen, A., Ledoit, O., & Sornette, D. (2000). "Crashes as critical points." *International Journal of Theoretical and Applied Finance*, 3(02), 219-255.
3. Sornette, D., Demos, G., Zhang, Q., Cauwels, P., Filimonov, V., & Zhang, Q. (2015). "Real-time prediction and post-mortem analysis of the Shanghai 2015 stock market bubble and crash." *Journal of Investment Strategies*, 4(4), 77-95.
4. Filimonov, V. & Sornette, D. (2013). "A stable and robust calibration scheme of the log-periodic power law model." *Physica A*, 392(17), 3698-3707.
5. Demos, G. & Sornette, D. (2017). "Birth or burst of financial bubbles: which one is easier to diagnose?" *Quantitative Finance*, 17(5), 657-675.

## 10. 总结

| 维度 | 结论 |
|------|------|
| **理论成熟度** | 高——基于临界现象和复杂系统理论，有严格数学框架 |
| **实证支持** | 强——多个历史泡沫事件的事后验证和实时预测 |
| **实用性** | 中高——有开源库 (Python/R)，但计算成本高、调参需经验 |
| **核心价值** | 是目前唯一能给出泡沫临界时间 tc 估计的主流方法 |
| **最佳用法** | 作为风险管理的预警信号，而非精确择时工具；与其他指标结合使用 |
