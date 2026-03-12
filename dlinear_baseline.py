"""
DLinear Baseline for Financial Time Series
===========================================

Complete, self-contained implementation of:
  1. Linear  — bare single linear layer
  2. NLinear — last-value normalization + linear
  3. DLinear — moving-avg decomposition + two linear layers

Plus walk-forward evaluation on synthetic & real-style financial data.

Reference: Zeng et al., "Are Transformers Effective for Time Series
Forecasting?", AAAI 2023.
"""

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from copy import deepcopy

# ============================================================
# 1. Model Definitions (PyTorch)
# ============================================================

class MovingAvg(nn.Module):
    """Moving average for trend extraction."""
    def __init__(self, kernel_size):
        super().__init__()
        self.kernel_size = kernel_size
        self.avg = nn.AvgPool1d(kernel_size=kernel_size, stride=1, padding=0)

    def forward(self, x):
        # x: [B, L, C]
        pad = (self.kernel_size - 1) // 2
        front = x[:, :1, :].repeat(1, pad, 1)
        end = x[:, -1:, :].repeat(1, pad, 1)
        x_padded = torch.cat([front, x, end], dim=1)
        # AvgPool1d operates on [B, C, L]
        trend = self.avg(x_padded.permute(0, 2, 1)).permute(0, 2, 1)
        return trend


class SeriesDecomp(nn.Module):
    """Decompose into trend (moving avg) and seasonal (residual)."""
    def __init__(self, kernel_size=25):
        super().__init__()
        self.moving_avg = MovingAvg(kernel_size)

    def forward(self, x):
        trend = self.moving_avg(x)
        seasonal = x - trend
        return seasonal, trend


class LinearModel(nn.Module):
    """
    Bare linear: one linear layer per channel.
    Maps [B, seq_len, C] -> [B, pred_len, C]
    """
    def __init__(self, seq_len, pred_len, n_channels, individual=True):
        super().__init__()
        self.seq_len = seq_len
        self.pred_len = pred_len
        self.individual = individual
        self.n_channels = n_channels

        if individual:
            self.layers = nn.ModuleList([
                nn.Linear(seq_len, pred_len) for _ in range(n_channels)
            ])
        else:
            self.layer = nn.Linear(seq_len, pred_len)

    def forward(self, x):
        # x: [B, seq_len, C]
        x = x.permute(0, 2, 1)  # [B, C, seq_len]
        if self.individual:
            out = torch.stack([
                self.layers[i](x[:, i, :]) for i in range(self.n_channels)
            ], dim=1)
        else:
            out = self.layer(x)
        return out.permute(0, 2, 1)  # [B, pred_len, C]


class NLinear(nn.Module):
    """
    NLinear: subtract last value -> linear -> add back.
    Handles distribution shift between lookback and horizon.
    """
    def __init__(self, seq_len, pred_len, n_channels, individual=True):
        super().__init__()
        self.seq_len = seq_len
        self.pred_len = pred_len
        self.individual = individual
        self.n_channels = n_channels

        if individual:
            self.layers = nn.ModuleList([
                nn.Linear(seq_len, pred_len) for _ in range(n_channels)
            ])
        else:
            self.layer = nn.Linear(seq_len, pred_len)

    def forward(self, x):
        # x: [B, seq_len, C]
        last_val = x[:, -1:, :]              # [B, 1, C]
        x_norm = x - last_val                # subtract last value
        x_norm = x_norm.permute(0, 2, 1)     # [B, C, seq_len]

        if self.individual:
            out = torch.stack([
                self.layers[i](x_norm[:, i, :]) for i in range(self.n_channels)
            ], dim=1)
        else:
            out = self.layer(x_norm)

        out = out.permute(0, 2, 1) + last_val  # add back
        return out


class DLinear(nn.Module):
    """
    DLinear: decompose -> trend linear + seasonal linear -> sum.

    Architecture:
        x --> [Decompose] --> seasonal --> Linear_S --> y_s
                           --> trend    --> Linear_T --> y_t
        output = y_s + y_t
    """
    def __init__(self, seq_len, pred_len, n_channels, individual=True,
                 kernel_size=25):
        super().__init__()
        self.seq_len = seq_len
        self.pred_len = pred_len
        self.individual = individual
        self.n_channels = n_channels

        self.decomp = SeriesDecomp(kernel_size)

        if individual:
            self.linear_seasonal = nn.ModuleList([
                nn.Linear(seq_len, pred_len) for _ in range(n_channels)
            ])
            self.linear_trend = nn.ModuleList([
                nn.Linear(seq_len, pred_len) for _ in range(n_channels)
            ])
        else:
            self.linear_seasonal = nn.Linear(seq_len, pred_len)
            self.linear_trend = nn.Linear(seq_len, pred_len)

    def forward(self, x):
        # x: [B, seq_len, C]
        seasonal, trend = self.decomp(x)
        seasonal = seasonal.permute(0, 2, 1)  # [B, C, seq_len]
        trend = trend.permute(0, 2, 1)

        if self.individual:
            s_out = torch.stack([
                self.linear_seasonal[i](seasonal[:, i, :])
                for i in range(self.n_channels)
            ], dim=1)
            t_out = torch.stack([
                self.linear_trend[i](trend[:, i, :])
                for i in range(self.n_channels)
            ], dim=1)
        else:
            s_out = self.linear_seasonal(seasonal)
            t_out = self.linear_trend(trend)

        out = s_out + t_out  # [B, C, pred_len]
        return out.permute(0, 2, 1)  # [B, pred_len, C]


# ============================================================
# 2. Dataset & Walk-Forward Utilities
# ============================================================

class TimeSeriesDataset(Dataset):
    """Sliding window dataset for time series."""
    def __init__(self, data, seq_len, pred_len):
        """
        data: np.ndarray of shape [T, C]
        """
        self.data = torch.FloatTensor(data)
        self.seq_len = seq_len
        self.pred_len = pred_len

    def __len__(self):
        return len(self.data) - self.seq_len - self.pred_len + 1

    def __getitem__(self, idx):
        x = self.data[idx : idx + self.seq_len]
        y = self.data[idx + self.seq_len : idx + self.seq_len + self.pred_len]
        return x, y


def train_model(model, train_loader, epochs=50, lr=1e-3, verbose=False):
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    criterion = nn.MSELoss()
    best_loss = float('inf')
    best_state = None
    patience = 10
    no_improve = 0

    for epoch in range(epochs):
        model.train()
        total_loss = 0
        n_batch = 0
        for x, y in train_loader:
            optimizer.zero_grad()
            pred = model(x)
            loss = criterion(pred, y)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            n_batch += 1

        avg_loss = total_loss / max(n_batch, 1)
        if avg_loss < best_loss:
            best_loss = avg_loss
            best_state = deepcopy(model.state_dict())
            no_improve = 0
        else:
            no_improve += 1

        if verbose and (epoch + 1) % 10 == 0:
            print(f"    Epoch {epoch+1:3d}  Loss={avg_loss:.6f}")

        if no_improve >= patience:
            break

    if best_state is not None:
        model.load_state_dict(best_state)
    return model


def evaluate_model(model, test_loader):
    model.eval()
    preds, actuals = [], []
    with torch.no_grad():
        for x, y in test_loader:
            pred = model(x)
            preds.append(pred.numpy())
            actuals.append(y.numpy())
    preds = np.concatenate(preds, axis=0)
    actuals = np.concatenate(actuals, axis=0)
    mse = np.mean((preds - actuals) ** 2)
    mae = np.mean(np.abs(preds - actuals))
    return mse, mae, preds, actuals


def walk_forward(data, model_class, model_kwargs,
                 seq_len, pred_len,
                 train_window=252, test_window=21, step=21,
                 epochs=50, lr=1e-3, batch_size=32):
    """
    Walk-forward (rolling window) evaluation.

    Returns list of dicts with predictions, actuals, and metrics per fold.
    """
    T = len(data)
    results = []
    fold = 0

    start = 0
    while start + train_window + test_window + seq_len + pred_len - 1 <= T:
        train_end = start + train_window
        test_end = min(train_end + test_window, T)

        train_data = data[start:train_end]
        test_data = data[train_end - seq_len : test_end]

        train_ds = TimeSeriesDataset(train_data, seq_len, pred_len)
        test_ds = TimeSeriesDataset(test_data, seq_len, pred_len)

        if len(train_ds) < batch_size or len(test_ds) == 0:
            start += step
            continue

        train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
        test_loader = DataLoader(test_ds, batch_size=batch_size, shuffle=False)

        model = model_class(**model_kwargs)
        model = train_model(model, train_loader, epochs=epochs, lr=lr)
        mse, mae, preds, actuals = evaluate_model(model, test_loader)

        results.append({
            'fold': fold,
            'train_range': (start, train_end),
            'test_range': (train_end, test_end),
            'mse': mse,
            'mae': mae,
            'preds': preds,
            'actuals': actuals,
        })
        fold += 1
        start += step

    return results


# ============================================================
# 3. Financial Data Generation
# ============================================================

def generate_financial_data(n_days=1500, seed=42):
    """
    Generate synthetic multi-feature financial data.

    Returns: np.ndarray [T, C] where C = 5 features:
      0: log_return_1d
      1: realized_vol_20d
      2: rsi_14 (scaled 0-1)
      3: mfi_14 (scaled 0-1)
      4: adx_14 (scaled 0-1)
    """
    rng = np.random.default_rng(seed)

    price = np.zeros(n_days)
    price[0] = 100.0
    returns = np.zeros(n_days)

    for i in range(1, n_days):
        if i < 400:
            drift, vol = 0.0003, 0.012
        elif i < 800:
            drift, vol = 0.001, 0.015
        elif i < 1100:
            drift, vol = -0.0008, 0.02
        else:
            drift, vol = 0.0002, 0.01

        r = drift + rng.normal(0, vol)
        returns[i] = r
        price[i] = price[i-1] * np.exp(r)

    # Realized volatility (20d rolling std)
    rvol = np.zeros(n_days)
    for i in range(20, n_days):
        rvol[i] = np.std(returns[i-20:i]) * np.sqrt(252)

    # Synthetic RSI-like feature
    rsi = np.zeros(n_days)
    gain_avg = 0.0
    loss_avg = 0.0
    for i in range(1, n_days):
        g = max(returns[i], 0)
        l = max(-returns[i], 0)
        if i <= 14:
            gain_avg = (gain_avg * (i-1) + g) / i
            loss_avg = (loss_avg * (i-1) + l) / i
        else:
            gain_avg = (gain_avg * 13 + g) / 14
            loss_avg = (loss_avg * 13 + l) / 14
        if loss_avg > 0:
            rsi[i] = gain_avg / (gain_avg + loss_avg)
        else:
            rsi[i] = 1.0

    # Synthetic MFI-like (add noise to RSI to simulate volume effect)
    mfi = np.clip(rsi + rng.normal(0, 0.05, n_days), 0, 1)

    # Synthetic ADX-like
    adx = np.zeros(n_days)
    for i in range(28, n_days):
        abs_rets = np.abs(returns[i-14:i])
        adx[i] = np.mean(abs_rets) / (np.std(returns[i-28:i]) + 1e-8)
    adx = np.clip(adx / np.max(adx + 1e-8), 0, 1)

    features = np.column_stack([returns, rvol, rsi, mfi, adx])
    return features, price, returns


# ============================================================
# 4. Trading Signal from Predictions
# ============================================================

def predictions_to_signals(preds_list, actuals_list, fold_ranges):
    """
    Convert multi-step return predictions to trading signals.

    Uses the predicted next-step return sign as the position.
    Returns aligned signals and actual returns for PnL computation.
    """
    signals = []
    actual_rets = []

    for preds, actuals, (t_start, t_end) in zip(preds_list, actuals_list, fold_ranges):
        for i in range(len(preds)):
            pred_ret = preds[i, 0, 0]
            actual_ret = actuals[i, 0, 0]
            sig = 1.0 if pred_ret > 0 else -1.0
            signals.append(sig)
            actual_rets.append(actual_ret)

    return np.array(signals), np.array(actual_rets)


# ============================================================
# 5. Main Demo
# ============================================================

def main():
    print("=" * 65)
    print("DLinear Baseline for Financial Time Series")
    print("=" * 65)

    # --- Parameters ---
    SEQ_LEN = 60
    PRED_LEN = 5
    TRAIN_WINDOW = 252
    TEST_WINDOW = 21
    STEP = 21
    EPOCHS = 30
    LR = 1e-3
    BATCH = 32

    print(f"\nConfig: seq_len={SEQ_LEN}, pred_len={PRED_LEN}, "
          f"train={TRAIN_WINDOW}d, test={TEST_WINDOW}d, step={STEP}d")

    # --- Data ---
    features, price, returns = generate_financial_data(n_days=1500)
    N, C = features.shape
    print(f"Data: {N} days, {C} features "
          f"(return, rvol, rsi, mfi, adx)")

    # --- Models to compare ---
    models = {
        'Linear': (LinearModel, {
            'seq_len': SEQ_LEN, 'pred_len': PRED_LEN,
            'n_channels': C, 'individual': True,
        }),
        'NLinear': (NLinear, {
            'seq_len': SEQ_LEN, 'pred_len': PRED_LEN,
            'n_channels': C, 'individual': True,
        }),
        'DLinear': (DLinear, {
            'seq_len': SEQ_LEN, 'pred_len': PRED_LEN,
            'n_channels': C, 'individual': True, 'kernel_size': 25,
        }),
    }

    all_results = {}

    for name, (model_cls, model_kwargs) in models.items():
        print(f"\n--- {name} ---")

        n_params = sum(p.numel() for p in model_cls(**model_kwargs).parameters())
        print(f"  Parameters: {n_params:,}")

        results = walk_forward(
            features, model_cls, model_kwargs,
            seq_len=SEQ_LEN, pred_len=PRED_LEN,
            train_window=TRAIN_WINDOW, test_window=TEST_WINDOW,
            step=STEP, epochs=EPOCHS, lr=LR, batch_size=BATCH,
        )

        mse_list = [r['mse'] for r in results]
        mae_list = [r['mae'] for r in results]
        print(f"  Folds: {len(results)}")
        print(f"  MSE:   {np.mean(mse_list):.6f} ± {np.std(mse_list):.6f}")
        print(f"  MAE:   {np.mean(mae_list):.6f} ± {np.std(mae_list):.6f}")

        preds_list = [r['preds'] for r in results]
        actuals_list = [r['actuals'] for r in results]
        fold_ranges = [r['test_range'] for r in results]

        signals, actual_rets = predictions_to_signals(
            preds_list, actuals_list, fold_ranges
        )

        if len(signals) > 0:
            strat_rets = signals * actual_rets
            cum_pnl = np.cumsum(strat_rets)
            total_ret = cum_pnl[-1]
            sharpe = np.mean(strat_rets) / (np.std(strat_rets) + 1e-8) * np.sqrt(252)
            accuracy = np.mean((signals > 0) == (actual_rets > 0))
            print(f"  Direction accuracy: {accuracy:.3f}")
            print(f"  Annual Sharpe (approx): {sharpe:.3f}")
            print(f"  Cum return: {total_ret:.4f}")

        all_results[name] = {
            'results': results,
            'signals': signals,
            'actual_rets': actual_rets,
        }

    # --- Buy & Hold baseline ---
    bh_start = TRAIN_WINDOW + SEQ_LEN
    bh_rets = returns[bh_start:]
    bh_sharpe = np.mean(bh_rets) / (np.std(bh_rets) + 1e-8) * np.sqrt(252)
    print(f"\n--- Buy & Hold ---")
    print(f"  Annual Sharpe (approx): {bh_sharpe:.3f}")
    print(f"  Cum return: {np.sum(bh_rets):.4f}")

    # --- Naive: predict yesterday's return ---
    naive_signals = np.sign(returns[bh_start - 1 : bh_start - 1 + len(all_results['DLinear']['signals'])])
    naive_rets = all_results['DLinear']['actual_rets']
    if len(naive_signals) == len(naive_rets):
        naive_strat = naive_signals * naive_rets
        naive_sharpe = np.mean(naive_strat) / (np.std(naive_strat) + 1e-8) * np.sqrt(252)
        print(f"\n--- Naive (yesterday's sign) ---")
        print(f"  Annual Sharpe (approx): {naive_sharpe:.3f}")

    # ============================================================
    # PLOT
    # ============================================================
    fig, axes = plt.subplots(4, 1, figsize=(15, 16), sharex=False)

    # Panel 1: Price with regime annotations
    axes[0].plot(price, 'k-', linewidth=0.7)
    axes[0].axvline(400, color='gray', ls='--', alpha=0.4)
    axes[0].axvline(800, color='gray', ls='--', alpha=0.4)
    axes[0].axvline(1100, color='gray', ls='--', alpha=0.4)
    axes[0].text(200, price.max()*0.95, 'Sideways', ha='center', fontsize=9, color='blue')
    axes[0].text(600, price.max()*0.95, 'Uptrend', ha='center', fontsize=9, color='blue')
    axes[0].text(950, price.max()*0.95, 'Downtrend', ha='center', fontsize=9, color='red')
    axes[0].text(1300, price.max()*0.95, 'Recovery', ha='center', fontsize=9, color='blue')
    axes[0].set_ylabel('Price')
    axes[0].set_title('Synthetic Price Series with Regime Changes')
    axes[0].grid(True, alpha=0.3)

    # Panel 2: Walk-forward MSE per fold
    colors = {'Linear': 'gray', 'NLinear': 'blue', 'DLinear': 'red'}
    for name, data in all_results.items():
        fold_centers = [(r['test_range'][0] + r['test_range'][1]) / 2
                        for r in data['results']]
        mses = [r['mse'] for r in data['results']]
        axes[1].plot(fold_centers, mses, 'o-', markersize=3, linewidth=0.8,
                     color=colors[name], label=name, alpha=0.8)
    axes[1].set_ylabel('MSE')
    axes[1].set_title('Walk-Forward MSE per Fold')
    axes[1].legend(fontsize=8)
    axes[1].grid(True, alpha=0.3)

    # Panel 3: Cumulative strategy PnL
    for name, data in all_results.items():
        if len(data['signals']) > 0:
            cum = np.cumsum(data['signals'] * data['actual_rets'])
            axes[2].plot(cum, linewidth=1.0, color=colors[name], label=name)
    # Buy & hold
    bh_cum = np.cumsum(returns[bh_start : bh_start + len(all_results['DLinear']['signals'])])
    if len(bh_cum) > 0:
        axes[2].plot(bh_cum[:len(all_results['DLinear']['signals'])],
                     'k--', linewidth=0.7, alpha=0.5, label='Buy & Hold')
    axes[2].axhline(0, color='gray', linewidth=0.5)
    axes[2].set_ylabel('Cumulative Return')
    axes[2].set_title('Walk-Forward Trading PnL (predicted return sign → position)')
    axes[2].legend(fontsize=8)
    axes[2].grid(True, alpha=0.3)

    # Panel 4: DLinear architecture diagram (text)
    axes[3].axis('off')
    arch_text = """
    DLinear Architecture (Zeng et al., AAAI 2023)
    ══════════════════════════════════════════════

    Input: x ∈ ℝ^{B × L × C}     (B=batch, L=seq_len, C=channels)
           │
           ▼
    ┌─────────────────┐
    │  MovingAvg(k=25) │──→  trend  ∈ ℝ^{B × L × C}
    │  x - MovingAvg   │──→ seasonal ∈ ℝ^{B × L × C}
    └─────────────────┘
           │                    │
           ▼                    ▼
    ┌──────────────┐    ┌──────────────┐
    │ Linear(L→H)  │    │ Linear(L→H)  │
    │ (seasonal)   │    │  (trend)     │
    └──────────────┘    └──────────────┘
           │                    │
           └────────┬───────────┘
                    ▼
              y = y_s + y_t  ∈ ℝ^{B × H × C}

    L = lookback window (seq_len)
    H = forecast horizon (pred_len)
    C = number of channels/features
    k = moving average kernel size

    Key insight: Each linear layer has only L × H parameters.
    Total params ≈ 2 × L × H × C  (individual mode)
    For L=60, H=5, C=5:  total = 3,000 parameters
    """
    axes[3].text(0.05, 0.95, arch_text, transform=axes[3].transAxes,
                 fontsize=9, fontfamily='monospace', verticalalignment='top')

    plt.tight_layout()
    plt.savefig('dlinear_baseline.png', dpi=150)
    plt.close()
    print(f"\nPlot saved to dlinear_baseline.png")

    # --- Summary ---
    print("\n" + "=" * 65)
    print("DLINEAR BASELINE: HOW IT WORKS")
    print("=" * 65)
    print("""
DLinear 做 baseline 的标准流程:

1. 数据准备
   - 输入特征: 不用原始价格, 用收益率/技术指标/因子
   - 格式: [T, C] 矩阵, T=时间步, C=特征数
   - 标准化: 每个 fold 内用训练集的 mean/std 标准化 (可选)

2. 模型结构
   - MovingAvg(kernel=25) 分解出 trend 和 seasonal
   - 两个独立的 Linear(seq_len → pred_len) 分别映射
   - 输出 = seasonal 预测 + trend 预测
   - 参数量极少: seq=60, pred=5, ch=5 → 仅 3,000 参数

3. 训练
   - 损失函数: MSE (预测任务) 或自定义 (如 -Sharpe)
   - 优化器: Adam, lr=1e-3
   - Early stopping: patience=10
   - Epochs: 30~100 通常足够

4. Walk-Forward 验证
   - 训练窗口: 252 天 (1年)
   - 测试窗口: 21 天 (1月)
   - 步长: 21 天
   - 每个 fold 重新训练, 绝不用未来数据

5. 评估
   - 预测指标: MSE, MAE
   - 交易指标: 方向准确率, Sharpe Ratio, 最大回撤
   - 基准对比: Buy & Hold, Naive (昨日方向)

6. 作为 baseline 的原则
   - 如果 DLinear 都无法获得 > 0.5 Sharpe → 数据中可能没有可提取的信号
   - 如果 DLinear Sharpe ≈ 0.3~0.8 → 可以尝试更复杂模型 (Transformer)
   - 更复杂模型必须显著超过 DLinear 才有意义 (而非仅仅 MSE 略低)
""")


if __name__ == "__main__":
    main()
