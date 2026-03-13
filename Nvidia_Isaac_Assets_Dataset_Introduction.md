# NVIDIA Isaac Assets 数据集介绍

## 1. 概述

**NVIDIA Isaac Assets** 是 NVIDIA 为机器人仿真平台 **Isaac Sim** 提供的一套预配置、仿真就绪的 3D 模型与组件集合。该数据集基于 **OpenUSD（Universal Scene Description）** 格式构建，涵盖超过 1,000 个 SimReady 3D 资产，包括工业设备、仓储环境、各类机器人模型等，旨在加速机器人模拟、合成数据生成及 AI 模型训练工作流程。

Isaac Sim 是 NVIDIA Omniverse 平台上的开源参考框架，能够让开发者在物理仿真的虚拟环境中模拟和测试 AI 驱动的机器人方案。Isaac Assets 是该生态系统的核心组成部分。

---

## 2. 资产分类

### 2.1 机器人资产

Isaac Sim 提供了多种类别的预配置机器人模型：

| 类别 | 代表型号 |
|------|---------|
| **轮式机器人** | iRobot Create3、Turtlebot3、NVIDIA JetBot、NovaCarter |
| **全向机器人** | idealworks iw.hub 系列 |
| **四足机器人** | ANYbotics ANYmal、Boston Dynamics Spot、Unitree、NVIDIA Leatherback |
| **机械臂** | Fanuc、KUKA、Universal Robots、Techman、Franka Panda、Fraunhofer Evobot |
| **人形机器人** | 1X、Agility Robotics Digit、Fourier Intelligence、Sanctuary AI |
| **自主移动机器人 (AMR)** | idealworks iw.hub、iRobot |
| **叉车** | ForkliftB、ForkliftC 系列 |
| **无人机** | 多旋翼航拍无人机 |

### 2.2 环境与道具资产

- **工业仓储环境**：传送带、货架、托盘、箱体等
- **物理可抓取物体**：用于机器人抓取和放置测试的物体
- **场景组件**：地面、墙壁、照明等基础场景构建元素
- **SimReady 3D 资产**：超过 1,000 个预配置的仿真就绪资产

### 2.3 专项数据集（Hugging Face 上发布）

| 数据集 | 描述 | 规模 |
|--------|------|------|
| **PhysicalAI-SimReady-Warehouse-01** | 工业仓储环境 OpenUSD 资产集合，含 800+ 物体 | 包含 Props、Scenarios、Assemblies 等类别 |
| **PhysicalAI-Robotics-Manipulation-Augmented** | Franka Panda 机器人执行方块堆叠任务的 1,000 条合成演示数据 | 69.4 GB，多模态（RGB、深度、分割、法线） |
| **PhysicalAI-Robotics-NuRec** | Nova Carter 机器人数据的 3D 场景重建，含碰撞检测网格和渲染组件 | 包含占用网格图和办公环境 |

---

## 3. 资产结构

Isaac Sim 采用标准化的三阶段资产组织结构：

### 3.1 源阶段（Source）

包含原始导入资产：

- `asset_base.usd` — 基础资产文件
- `parts.usd` — 独立部件
- `materials.usd` — 材质定义

### 3.2 变换阶段（Transformation）

优化资产以适配仿真需求：

- 扁平化层级结构
- 分离视觉几何体与碰撞体
- 合并网格以降低复杂度
- 简化材质和纹理

### 3.3 特征阶段（Features）

以轻量级 USD 层的形式添加仿真能力：

- `asset_physics.usd` — 物理属性（质量、摩擦力、碰撞体）
- 传感器配置
- 控制图（Action/Articulation graphs）
- ROS/ROS2 集成

最终通过 `asset.usd` 文件将所有组件通过子层（sublayer）和载荷（payload）机制整合。

---

## 4. 物理属性与 USD Schema

### 4.1 核心物理 Schema

所有资产的物理属性基于 **USD Physics Schemas** 和 **PhysX Schemas** 定义：

| Schema | 功能 |
|--------|------|
| `USDPhysics Collider` | 为几何基元（prim）定义碰撞形状 |
| `USDPhysics Mass` | 以千克（kg）为单位设置质量 |
| `USDPhysics Material` | 定义静摩擦、动摩擦、密度、恢复系数 |
| `USDPhysics Rigid Body` | 应用于根基元以启用物理参与 |

物理属性命名遵循 `schema_name:attribute_name` 规范（如 `physics:velocity`）。

### 4.2 机器人专用 Schema

实验性的 **IsaacRobotAPI** 通过结构化 API 标准化机器人表示：

- Links（连杆）定义
- Joints（关节）定义
- 元数据（Metadata）
- 运动学树（Kinematic Tree）

---

## 5. 合成数据生成

Isaac Sim 通过内置的 **Replicator** 框架实现大规模合成数据生成（Synthetic Data Generation, SDG）：

### 5.1 核心能力

- **域随机化（Domain Randomization）**：系统性地变换物体姿态、光照条件、纹理和相机角度
- **自动化标注**：通过 Annotator 和 Writer API 自动生成语义标注
- **多模态输出**：RGB 图像、深度图、实例分割、语义分割、法线图、边界框等

### 5.2 GR00T 合成数据流水线

NVIDIA Isaac GR00T 提供专用的合成数据生成蓝图：

| 蓝图 | 功能 |
|------|------|
| **GR00T-Mimic** | 从少量人类演示生成大量合成运动轨迹 |
| **GR00T-Dreams** | 基于 Cosmos 世界基础模型，从单张图像和语言指令生成轨迹数据 |
| **GR00T-Teleop** | 通过远程操作采集高质量人类演示数据 |

### 5.3 典型工作流

```
人类演示采集 → 仿真环境构建 → 域随机化配置 → 批量数据生成 → 模型训练
     ↓                                                    ↓
 GR00T-Teleop                                    Isaac Lab / Isaac Sim
```

---

## 6. 应用场景

### 6.1 感知模型训练

利用 Replicator 生成的合成数据训练目标检测、语义分割等视觉感知模型，解决真实数据采集成本高、标注困难的问题。

### 6.2 机器人操控学习

通过 Isaac Lab 进行 GPU 加速的强化学习训练，支持零样本迁移（zero-shot transfer）和跨体型泛化（cross-embodiment generalization）。

### 6.3 导航与运动规划

使用预配置的仓储环境和机器人模型进行导航策略训练和运动规划测试。

### 6.4 Sim-to-Real 迁移

结合全身强化学习和合成数据驱动的训练流水线，将仿真环境中训练的策略迁移到真实机器人上。

---

## 7. 获取与使用

### 7.1 获取途径

- **Isaac Sim 内置**：通过 Asset Browser / Content Browser 访问，路径位于 `Isaac Sim/Robots` 等文件夹
- **NVIDIA NGC**：通过 NVIDIA GPU Cloud 下载 Isaac Sim 及其资产包
- **Hugging Face**：在 NVIDIA 官方 Hugging Face 组织页面获取专项数据集
- **GitHub**：GR00T-Dreams 等工具链在 GitHub 开源

### 7.2 许可协议

大部分数据集采用 **CC-BY-4.0** 许可协议，允许商业和非商业用途的使用、修改和再分发。

### 7.3 系统要求

- NVIDIA RTX GPU（推荐 RTX 3070 及以上）
- Isaac Sim 4.x 或更高版本
- 支持 Linux（Ubuntu）操作系统
- 安装 NVIDIA Omniverse Launcher

---

## 8. 数据样例

以下提供各类数据集的具体数据样例，帮助理解数据的实际格式与内容。

### 8.1 仓储资产目录样例（SimReady-Warehouse-01 CSV）

CSV 目录文件 `physical_ai_simready_warehouse_01.csv` 中的每条记录描述一个 3D 资产：

```csv
thumbnail_path,mass(kg),q_code,label,classification,relative_path,asset_name
thumbnails/Pallets_A1.png,25.0,Q814951,pallet,Prop,Props/Pallets/Pallets_A1/Pallets_A1.usd,Pallets_A1
thumbnails/Pallets_A2.png,22.5,Q814951,pallet,Prop,Props/Pallets/Pallets_A2/Pallets_A2.usd,Pallets_A2
thumbnails/ConveyorBelt_A1.png,150.0,Q1142498,conveyor belt,Assembly,Assemblies/ConveyorBelt_A1/ConveyorBelt_A1.usd,ConveyorBelt_A1
thumbnails/CardboardBox_A1.png,0.8,Q1379659,cardboard box,Prop,Props/Boxes/CardboardBox_A1/CardboardBox_A1.usd,CardboardBox_A1
thumbnails/Warehouse_Small.png,0,Q1362872,warehouse,Scenario,Scenarios/Warehouse_Small/Warehouse_Small.usd,Warehouse_Small
```

**字段说明：**

| 字段 | 含义 | 示例值 |
|------|------|--------|
| `thumbnail_path` | 缩略图路径（PNG） | `thumbnails/Pallets_A1.png` |
| `mass(kg)` | 物体近似质量（千克） | `25.0` |
| `q_code` | WikiData 语义标签 Q 编码 | `Q814951`（托盘） |
| `label` | Q 编码的英文标签 | `pallet` |
| `classification` | 资产分类 | `Prop` / `Assembly` / `Scenario` |
| `relative_path` | USD 文件在归档中的相对路径 | `Props/Pallets/Pallets_A1/Pallets_A1.usd` |
| `asset_name` | 资产名称 | `Pallets_A1` |

### 8.2 机器人资产文件结构样例（Franka Panda）

以 Franka Panda 机械臂为例，一个完整的机器人资产目录结构如下：

```
/Isaac/Robots/FrankaRobotics/FrankaPanda/
├── franka.usd                  # 最终组合文件（入口）
├── franka_base.usd             # 基础结构层
├── franka_physics.usd          # 物理属性层
├── franka_sensors.usd          # 传感器层
├── franka_control.usd          # 控制图层
├── parts/
│   ├── link0.usd               # 基座
│   ├── link1.usd               # 关节 1 连杆
│   ├── link2.usd               # 关节 2 连杆
│   ├── link3.usd               # 关节 3 连杆
│   ├── link4.usd               # 关节 4 连杆
│   ├── link5.usd               # 关节 5 连杆
│   ├── link6.usd               # 关节 6 连杆
│   ├── link7.usd               # 关节 7 连杆（末端）
│   ├── hand.usd                # 夹爪基座
│   ├── finger_left.usd         # 左手指
│   └── finger_right.usd        # 右手指
└── materials/
    └── franka_materials.usd    # PBR 材质
```

USD 文件内部 Prim 层级结构示意：

```
/panda                                  (defaultPrim, Articulation Root)
├── /panda/link0                        (Rigid Body, Collider)
│   ├── /panda/link0/visuals            (Mesh - 渲染用)
│   └── /panda/link0/collisions         (Mesh - 碰撞检测用)
├── /panda/link1                        (Rigid Body, Collider)
│   └── ...
├── /panda/panda_joint1                 (Revolute Joint: link0 → link1)
│   ├── physics:lowerLimit = -2.8973    (弧度)
│   ├── physics:upperLimit = 2.8973
│   └── drive:angular:physics:damping = 1000.0
├── /panda/panda_joint2                 (Revolute Joint: link1 → link2)
│   └── ...
├── ...
├── /panda/hand                         (Rigid Body)
├── /panda/finger_joint_left            (Prismatic Joint: hand → finger_left)
│   ├── physics:lowerLimit = 0.0        (米)
│   └── physics:upperLimit = 0.04
└── /panda/finger_joint_right           (Prismatic Joint: hand → finger_right)
```

### 8.3 操控数据集样例（Manipulation-Augmented HDF5）

数据集文件 `mimic_dataset_1k.hdf5` 中每条轨迹的数据结构：

```
mimic_dataset_1k.hdf5
└── data/
    ├── demo_0/                              # 第 1 条演示轨迹
    │   ├── actions                          # shape: (T, 7) — T 为时间步数
    │   │   # 每个时间步: [dx, dy, dz, droll, dpitch, dyaw, gripper]
    │   │   # 前 6 维: 末端执行器相对位移/旋转; 第 7 维: 夹爪开合
    │   ├── obs/
    │   │   ├── table_rgb                    # shape: (T, 200, 200, 3), uint8
    │   │   ├── table_depth                  # shape: (T, 200, 200, 1), float32
    │   │   ├── table_segmentation           # shape: (T, 200, 200, 1), uint8
    │   │   ├── table_surface_normal         # shape: (T, 200, 200, 3), float32
    │   │   └── wrist_rgb                    # shape: (T, 200, 200, 3), uint8
    │   ├── states                           # shape: (T, N) — 机器人全状态
    │   └── attrs/
    │       ├── num_samples: 187             # 该轨迹的时间步数
    │       └── task: "stack_cubes"          # 任务名称
    ├── demo_1/
    │   └── ...
    ├── demo_2/
    │   └── ...
    └── ...（共 1,000 条演示）
```

**单个时间步数据样例：**

```json
{
  "action": [0.002, -0.015, 0.008, 0.001, -0.003, 0.012, 1.0],
  "obs": {
    "table_rgb": "/* 200x200x3 uint8 图像数组 */",
    "table_depth": "/* 200x200x1 float32 深度图, 单位: 米 */",
    "table_segmentation": "/* 200x200x1 uint8 语义分割掩码: 0=背景, 1=蓝色方块, 2=红色方块, 3=绿色方块, 4=机械臂 */",
    "table_surface_normal": "/* 200x200x3 float32 表面法线图 */",
    "wrist_rgb": "/* 200x200x3 uint8 腕部相机图像 */"
  },
  "state": {
    "joint_positions": [0.12, -0.57, 0.08, -2.35, 0.01, 1.87, 0.73],
    "joint_velocities": [0.001, -0.003, 0.002, 0.001, 0.000, -0.001, 0.001],
    "ee_position": [0.45, 0.12, 0.28],
    "ee_orientation": [0.707, 0.0, 0.707, 0.0],
    "gripper_width": 0.04
  }
}
```

### 8.4 NuRec 场景重建数据集样例

NuRec 数据集中每个场景的文件结构：

```
PhysicalAI-Robotics-NuRec/
├── nova_carter-cafe/
│   ├── stage.usdz                   # 3DGUT 场景文件 (可直接加载到 Isaac Sim)
│   ├── mesh/
│   │   └── collision_mesh.usd       # nvblox 生成的碰撞检测网格
│   └── occupancy_map/
│       └── occupancy_map.png        # 2D 占用网格图 (黑=障碍, 白=可通行)
├── nova_carter-galileo/
│   ├── stage.usdz
│   ├── mesh/
│   │   └── collision_mesh.usd
│   └── occupancy_map/
│       └── occupancy_map.png
├── nova_carter-wormhole/
│   └── ...
└── zh_lounge/
    └── usd/
        └── zh_lounge.usda           # ASCII 格式 USD 场景
```

**场景特点说明：**

| 场景名 | 描述 | 用途 |
|--------|------|------|
| `nova_carter-cafe` | 咖啡厅环境，由 Nova Carter 机器人采集 | 室内导航、避障 |
| `nova_carter-galileo` | 实验室/办公环境 | 移动机器人路径规划 |
| `nova_carter-wormhole` | 复杂走廊环境 | 狭窄空间导航测试 |
| `zh_lounge` | 休息室环境 | 室内场景理解 |

### 8.5 Replicator 合成数据输出样例

通过 Replicator 生成的感知训练数据，输出目录结构如下：

```
output_dataset/
├── rgb/
│   ├── 000000.png                   # 200x200 或自定义分辨率 RGB 图像
│   ├── 000001.png
│   └── ...
├── depth/
│   ├── 000000.npy                   # float32 深度图 (单位: 米)
│   └── ...
├── semantic_segmentation/
│   ├── 000000.png                   # 语义分割掩码
│   └── ...
├── instance_segmentation/
│   ├── 000000.png                   # 实例分割掩码
│   └── ...
├── object_detection.json            # 汇总的目标检测标注
└── camera_params/
    ├── 000000.json                  # 相机内外参
    └── ...
```

**`object_detection.json` 标注样例（单帧）：**

```json
{
  "frame_id": 0,
  "objects": [
    {
      "class": "pallet_jack",
      "semantic_id": 1,
      "instance_id": 101,
      "bbox_2d_tight": [120, 85, 310, 195],
      "bbox_2d_loose": [115, 80, 315, 200],
      "bbox_3d": {
        "center": [1.25, 0.45, 0.30],
        "dimensions": [1.20, 0.68, 0.35],
        "orientation": [0.0, 0.0, 0.15, 0.99]
      },
      "visibility": 0.92,
      "occlusion": 0.08
    },
    {
      "class": "cardboard_box",
      "semantic_id": 2,
      "instance_id": 201,
      "bbox_2d_tight": [50, 140, 95, 180],
      "bbox_2d_loose": [45, 135, 100, 185],
      "bbox_3d": {
        "center": [2.10, -0.30, 0.15],
        "dimensions": [0.40, 0.30, 0.30],
        "orientation": [0.0, 0.0, 0.0, 1.0]
      },
      "visibility": 1.0,
      "occlusion": 0.0
    }
  ],
  "camera": {
    "intrinsics": [[600.0, 0, 100.0], [0, 600.0, 100.0], [0, 0, 1]],
    "extrinsics": {
      "position": [0.0, 2.5, 1.8],
      "orientation": [0.924, -0.383, 0.0, 0.0]
    }
  }
}
```

**字段说明：**

| 字段 | 含义 |
|------|------|
| `bbox_2d_tight` | 紧凑 2D 边界框 `[x_min, y_min, x_max, y_max]`（像素） |
| `bbox_2d_loose` | 宽松 2D 边界框（含边距） |
| `bbox_3d.center` | 3D 边界框中心坐标 `[x, y, z]`（米） |
| `bbox_3d.dimensions` | 3D 边界框尺寸 `[长, 宽, 高]`（米） |
| `bbox_3d.orientation` | 四元数旋转 `[x, y, z, w]` |
| `visibility` | 可见比例（0.0~1.0） |
| `occlusion` | 遮挡比例（0.0~1.0） |

---

## 9. 相关链接

| 资源 | 链接 |
|------|------|
| Isaac Sim 官方文档 | https://docs.isaacsim.omniverse.nvidia.com/ |
| Isaac Sim 资产概览 | https://docs.isaacsim.omniverse.nvidia.com/latest/assets/usd_assets_overview.html |
| 机器人资产列表 | https://docs.isaacsim.omniverse.nvidia.com/latest/assets/usd_assets_robots.html |
| 资产结构说明 | https://docs.isaacsim.omniverse.nvidia.com/latest/robot_setup/asset_structure.html |
| Isaac GR00T | https://developer.nvidia.com/isaac/gr00t |
| PhysicalAI-SimReady-Warehouse-01 | https://huggingface.co/datasets/nvidia/PhysicalAI-SimReady-Warehouse-01 |
| PhysicalAI-Robotics-Manipulation-Augmented | https://huggingface.co/datasets/nvidia/PhysicalAI-Robotics-Manipulation-Augmented |
| PhysicalAI-Robotics-NuRec | https://huggingface.co/datasets/nvidia/PhysicalAI-Robotics-NuRec |
| Isaac Sim 开发者页面 | https://developer.nvidia.com/isaac-sim |
| Replicator 合成数据生成 | https://developer.nvidia.com/omniverse/replicator |
