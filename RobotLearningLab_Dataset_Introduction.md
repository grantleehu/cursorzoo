# RobotLearningLab 数据集介绍

## 1. 概述

**RobotLearningLab_Dataset** 是由 **NVIDIA China-SAE（中国汽车工程学会合作项目）** 发布的综合性机器人操控学习数据集，托管于 Hugging Face（`china-sae-robotics/RobotLearningLab_Dataset`），配套 GitHub 代码仓库 `nvidia-china-sae/RobotLearningLab`。

该数据集围绕 **NVIDIA Isaac Lab** 仿真平台构建，覆盖从 3D 资产、专家演示、合成运动轨迹到模型后训练数据的完整机器人操控学习流水线，支持以下核心工作流：

| 工作流 | 说明 |
|--------|------|
| **SMMG（合成操控运动生成）** | 从少量人类演示生成大规模合成运动轨迹 |
| **模仿学习策略训练** | 基于演示数据训练操控策略 |
| **VLA 后训练** | 视觉-语言-动作基础模型（如 GR00T-Nx）的后训练微调 |
| **闭环评估与部署** | 在仿真和真实环境中评估并部署训练好的策略 |

---

## 2. 数据集目录结构

数据集由四个顶层目录组成：

```
RobotLearningLab_Dataset/
├── data/                        # USD 3D 资产
│   ├── robots/                  # 机器人模型
│   ├── rigid_objects/           # 刚体物体
│   └── articulated_objects/     # 关节物体
├── libero/                      # LIBERO 基准测试资产与数据
│   ├── USD/                     # 场景与物体 USD 资产
│   ├── assembled_hdf5/          # 组装好的演示轨迹
│   ├── replayed_demos/          # 重放后的成功演示
│   ├── video_datasets/          # 任务成功/失败视频
│   └── lerobot_task_space/      # LeRobot 格式（GR00T-Nx 后训练用）
├── record_datasets/             # 专家遥操作演示数据
│   └── *.hdf5                   # 用于 Mimic 工作流的种子演示
└── usecase/                     # 应用场景数据
    ├── Sim2Lab/                 # 仿真到实验室迁移
    │   ├── agibot/              # Agibot 机器人任务
    │   └── xhumanoid/           # xHumanoid 机器人任务
    └── Sim2Real/                # 仿真到真实迁移
        └── galbot_stack_cube/   # Galbot 方块堆叠任务
```

---

## 3. 核心数据类型详解

### 3.1 USD 3D 资产（`data/`）

为 Isaac Lab 环境提供的 OpenUSD 格式 3D 模型，包含：

- **机器人模型**：Franka Panda、Piper 机械臂、Unitree G1 人形机器人等，含物理属性、关节定义、碰撞体
- **刚体物体**：方块、杯子等可抓取对象，预配置质量、摩擦力等物理参数
- **关节物体**：抽屉、柜门等含可活动部件的物体

### 3.2 LIBERO 基准数据（`libero/`）

基于 [LIBERO 基准](https://libero-project.github.io/) 构建的操控学习评测数据，LIBERO 是针对终身机器人学习中知识迁移问题的标准化基准，包含 130 个任务，划分为四个任务套件：

| 任务套件 | 关注点 | 任务数 |
|----------|--------|--------|
| **LIBERO-Spatial** | 空间关系知识迁移 | 10 |
| **LIBERO-Object** | 物体知识迁移 | 10 |
| **LIBERO-Goal** | 目标知识迁移 | 10 |
| **LIBERO-100** | 大规模综合评测 | 100 |

RobotLearningLab 将原始 LIBERO 数据转换为 Isaac Lab 可用的 USD 场景资产，并提供组装好的 HDF5 演示轨迹、重放后的成功演示录制以及 LeRobot 格式的后训练数据。

### 3.3 专家遥操作演示（`record_datasets/`）

通过 Isaac Lab 中的遥操作系统采集的高质量人类专家演示，作为 SMMG 流水线的种子数据。少量种子演示即可通过 GR00T-Mimic 扩增为大规模合成数据集。

### 3.4 应用场景数据（`usecase/`）

按迁移目标组织的完整任务数据：

- **Sim2Lab**：仿真训练→实验室部署（Agibot、xHumanoid 平台）
- **Sim2Real**：仿真训练→真实环境部署（Galbot 方块堆叠）

每个场景包含 USD 资产、HDF5/JSON 运动轨迹和合成演示数据。

---

## 4. 支持的机器人平台

| 机器人 | 类型 | 应用场景 |
|--------|------|----------|
| **Franka Panda** | 7-DOF 机械臂 | LIBERO 基准评测、操控策略训练 |
| **Piper** | 机械臂 | 遥操作数据采集、操控学习 |
| **Unitree G1** | 人形机器人 | 全身操控、Sim2Real 迁移 |
| **Agibot** | 操控机器人 | Sim2Lab 工作流 |
| **xHumanoid** | 人形机器人 | Sim2Lab 工作流 |
| **Galbot** | 操控机器人 | Sim2Real 方块堆叠 |

---

## 5. SMMG 合成数据生成流水线

RobotLearningLab 的核心价值在于与 NVIDIA 的 **SMMG（Synthetic Manipulation Motion Generation）** 蓝图深度集成。该流水线由三个阶段组成：

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ GR00T-Teleop│────▶│ GR00T-Mimic  │────▶│  GR00T-Gen  │
│  遥操作采集  │     │  运动轨迹扩增  │     │ 域随机化扩展  │
│ (种子演示)   │     │ (轨迹倍增)    │     │ (场景多样化)  │
└─────────────┘     └──────────────┘     └─────────────┘
      │                    │                     │
   少量演示         中等规模轨迹           大规模合成数据
   (~10条)          (~1,000条)           (~780,000条)
```

**关键性能指标：**
- 从少量人类演示出发，11 小时内生成 **780,000 条合成轨迹**
- 等价于 **6,500 小时**的人类演示数据
- 与真实数据结合后，GR00T N1 模型性能提升 **40%**

---

## 6. 数据格式与样例

### 6.1 文件格式

| 格式 | 用途 | 说明 |
|------|------|------|
| `.usd` | 3D 资产 | OpenUSD 格式，含几何体、物理属性、材质 |
| `.hdf5` | 轨迹演示 | 分层数据格式，存储时序动作与观测 |
| `.json` | 运动轨迹 | 原始运动轨迹描述 |
| LeRobot 格式 | VLA 后训练 | 兼容 GR00T-Nx 的标准化数据格式 |

### 6.2 HDF5 演示轨迹样例（record_datasets）

```
record_dataset_example.hdf5
└── data/
    ├── demo_0/
    │   ├── actions                  # shape: (T, 7)
    │   │   # [dx, dy, dz, droll, dpitch, dyaw, gripper]
    │   ├── obs/
    │   │   ├── agentview_rgb        # shape: (T, 128, 128, 3), uint8
    │   │   ├── eye_in_hand_rgb      # shape: (T, 128, 128, 3), uint8
    │   │   └── joint_states         # shape: (T, 7), float32
    │   └── attrs/
    │       ├── num_samples: 152
    │       └── task: "pick_and_place"
    ├── demo_1/
    │   └── ...
    └── ...
```

**单个时间步数据样例：**

```json
{
  "action": [-0.005, 0.012, -0.008, 0.002, -0.001, 0.003, 1.0],
  "obs": {
    "agentview_rgb": "/* 128x128x3 uint8 第三人称视角图像 */",
    "eye_in_hand_rgb": "/* 128x128x3 uint8 手部相机图像 */",
    "joint_states": [0.08, -0.62, 0.15, -2.10, 0.03, 1.95, 0.68]
  }
}
```

### 6.3 LIBERO 组装演示样例（libero/assembled_hdf5）

```
libero_spatial_demo.hdf5
└── data/
    ├── demo_0/
    │   ├── actions                      # shape: (T, 7)
    │   ├── obs/
    │   │   ├── agentview_rgb            # shape: (T, 128, 128, 3)
    │   │   ├── robot0_eye_in_hand_rgb   # shape: (T, 128, 128, 3)
    │   │   ├── robot0_eef_pos           # shape: (T, 3) — 末端位置
    │   │   ├── robot0_eef_quat          # shape: (T, 4) — 末端四元数姿态
    │   │   ├── robot0_gripper_qpos      # shape: (T, 2) — 夹爪关节位置
    │   │   └── robot0_joint_pos         # shape: (T, 7) — 关节角度
    │   ├── rewards                      # shape: (T,) — 每步奖励
    │   ├── dones                        # shape: (T,) — 完成标志
    │   └── attrs/
    │       ├── num_samples: 203
    │       ├── task: "put_the_bowl_on_the_plate"
    │       └── task_suite: "LIBERO-Spatial"
    └── ...
```

**单步数据样例：**

```json
{
  "action": [0.003, -0.008, 0.015, 0.001, 0.002, -0.005, 0.8],
  "obs": {
    "agentview_rgb": "/* 128x128x3 场景俯视图 */",
    "robot0_eye_in_hand_rgb": "/* 128x128x3 手部视角 */",
    "robot0_eef_pos": [0.42, 0.15, 0.32],
    "robot0_eef_quat": [0.707, 0.0, 0.707, 0.0],
    "robot0_gripper_qpos": [0.04, 0.04],
    "robot0_joint_pos": [0.12, -0.55, 0.10, -2.30, 0.02, 1.88, 0.70]
  },
  "reward": 0.0,
  "done": false
}
```

### 6.4 Sim2Lab 合成运动轨迹样例（usecase/Sim2Lab）

```
usecase/Sim2Lab/agibot/
├── Assets/
│   ├── agibot_robot.usd             # 机器人 USD 资产
│   ├── table_scene.usd              # 场景 USD
│   └── cube_red.usd                 # 操控目标 USD
└── Datasets/
    ├── synthetic_demos.hdf5          # 合成运动演示
    ├── raw_trajectories.json         # 原始运动轨迹
    └── lerobot_task_space/           # LeRobot 格式数据
        ├── episode_000000.parquet
        ├── episode_000001.parquet
        └── meta/
            └── info.json
```

**JSON 运动轨迹样例（raw_trajectories.json）：**

```json
{
  "task": "stack_cube",
  "robot": "agibot",
  "trajectories": [
    {
      "trajectory_id": 0,
      "source": "smmg_mimic",
      "num_steps": 175,
      "waypoints": [
        {
          "step": 0,
          "ee_pos": [0.40, 0.00, 0.35],
          "ee_quat": [1.0, 0.0, 0.0, 0.0],
          "joint_pos": [0.0, -0.78, 0.0, -2.36, 0.0, 1.57, 0.78],
          "gripper": 1.0
        },
        {
          "step": 1,
          "ee_pos": [0.40, 0.01, 0.34],
          "ee_quat": [0.999, 0.001, 0.002, -0.001],
          "joint_pos": [0.001, -0.779, 0.002, -2.358, 0.001, 1.571, 0.781],
          "gripper": 1.0
        },
        {
          "step": 174,
          "ee_pos": [0.42, 0.05, 0.28],
          "ee_quat": [0.998, 0.01, 0.05, -0.003],
          "joint_pos": [0.05, -0.72, 0.08, -2.25, 0.03, 1.60, 0.75],
          "gripper": 0.0
        }
      ]
    }
  ]
}
```

### 6.5 Sim2Real 数据样例（usecase/Sim2Real）

```
usecase/Sim2Real/galbot_stack_cube/
├── Assets/
│   ├── galbot.usd                    # Galbot 机器人模型
│   └── scene_objects/
│       ├── cube_blue.usd
│       ├── cube_red.usd
│       └── cube_green.usd
└── Datasets/
    ├── sim_demos.hdf5                # 仿真环境合成演示
    ├── lerobot_task_space/           # LeRobot 格式（用于 GR00T-Nx 后训练）
    │   ├── episode_000000.parquet
    │   └── meta/
    │       └── info.json
    └── eval_results/
        ├── success_videos/           # 成功执行视频
        └── failure_videos/           # 失败执行视频
```

---

## 7. 与 GR00T 基础模型的关系

RobotLearningLab 数据集与 NVIDIA **GR00T（Generalist Robot 00 Technology）** 基础模型生态紧密集成：

```
RobotLearningLab_Dataset
        │
        ├── record_datasets (种子演示)
        │        │
        │        ▼
        │   GR00T-Mimic (合成扩增)
        │        │
        │        ▼
        │   GR00T-Gen (域随机化)
        │        │
        │        ▼
        │   大规模合成数据 ──────────┐
        │                          │
        ├── libero/lerobot ────────┤
        │                          ▼
        │                    GR00T-Nx 后训练
        │                          │
        │                          ▼
        └── usecase (Sim2Lab/Sim2Real 评估与部署)
```

- **GR00T N1 / N1.6**：3B 参数的视觉-语言-动作（VLA）基础模型
- 数据集中的 **LeRobot 格式数据** 直接用于 GR00T-Nx 后训练微调
- 支持跨体型（cross-embodiment）泛化能力的训练与评估

---

## 8. 与 Isaac Assets 数据集的对比

| 维度 | NVIDIA Isaac Assets | RobotLearningLab_Dataset |
|------|--------------------|-----------------------|
| **发布者** | NVIDIA 官方 | NVIDIA China-SAE |
| **核心内容** | 3D 仿真资产（机器人、环境、道具） | 操控学习全流水线数据（资产 + 演示 + 轨迹） |
| **主要格式** | OpenUSD (.usd) | USD + HDF5 + JSON + LeRobot |
| **侧重点** | 仿真环境构建、合成数据生成 | 操控策略学习、VLA 后训练 |
| **目标模型** | 通用仿真（Isaac Sim + Replicator） | GR00T-Nx 基础模型 |
| **基准测试** | 无内置基准 | LIBERO 130 任务基准 |
| **数据规模** | 1,000+ 3D 资产 | 资产 + 数万条演示轨迹 |
| **许可协议** | CC-BY-4.0 | Apache 2.0 |

两个数据集是互补关系：Isaac Assets 提供基础仿真环境，RobotLearningLab 在此基础上构建面向操控学习的完整数据流水线。

---

## 9. 获取与使用

### 9.1 获取途径

| 资源 | 地址 |
|------|------|
| 数据集（Hugging Face） | https://huggingface.co/datasets/china-sae-robotics/RobotLearningLab_Dataset |
| 代码仓库（GitHub） | https://github.com/nvidia-china-sae/RobotLearningLab |
| SMMG 蓝图 | https://github.com/NVIDIA-Omniverse-blueprints/synthetic-manipulation-motion-generation |
| GR00T 模型 | https://developer.nvidia.com/isaac/gr00t |
| Isaac Lab 文档 | https://isaac-sim.github.io/IsaacLab/ |

### 9.2 快速开始

```bash
# 克隆代码仓库
git clone https://github.com/nvidia-china-sae/RobotLearningLab.git

# 从 Hugging Face 下载数据集
pip install huggingface_hub
huggingface-cli download china-sae-robotics/RobotLearningLab_Dataset --repo-type dataset --local-dir ./RobotLearningLab_Dataset
```

### 9.3 许可协议

数据集采用 **Apache 2.0** 许可协议，允许商业和非商业用途的自由使用、修改和再分发。

### 9.4 系统要求

- NVIDIA RTX GPU（推荐 RTX 3070 及以上）
- Isaac Sim 4.x 或更高版本 + Isaac Lab
- Python 3.10+
- Linux（Ubuntu 22.04 推荐）
