# Kế Hoạch Kiểm Toán Phản Biện & Ma Trận Đối Chiếu — Tiny Gladiators

Kế hoạch kiểm toán độc lập và đối chiếu chuyên sâu toàn bộ mã nguồn trò chơi Tiny Gladiators. Dựa trên bản kiểm kê gốc, kế hoạch này thiết lập ma trận đối chiếu 5 cụm tính năng với 3 trạng thái kiểm chứng thực tế, danh mục lỗi có bằng chứng code xếp theo 4 cấp độ nghiêm trọng, và lộ trình xử lý dứt điểm trước khi phát triển nội dung mới.

## User Review & Critical Decisions

> [!IMPORTANT]
> Toàn bộ quá trình kiểm toán tuân thủ nguyên tắc độc lập và khách quan: không chấp nhận các nhận định cảm tính (như "chạy ổn định", "hoạt động hoàn hảo") nếu chưa có bằng chứng xác minh trực tiếp từ mã nguồn hoặc kiểm thử thực tế. Mọi kết luận kỹ thuật đều dẫn chiếu số dòng cụ thể.

- **Phạm vi kiểm toán xác nhận**: Kiểm toán toàn diện cả 5 cụm tính năng cốt lõi (Chiến đấu, AI & Kẻ địch, Kinh tế & Rương, Lưu trữ bảo mật, Hiệu năng & Vận hành runtime).
- **Khung phân loại 4 cấp độ nghiêm trọng**:
  1. *Chặn tiến trình (Critical/Game-Breaking)*: Gây treo game, deadlock vòng lặp tính năng, hoặc mất dữ liệu.
  2. *Lỗ hổng khai thác (Exploit)*: Phá vỡ tính cân bằng gameplay qua hành vi spam phím hoặc gian lận cơ chế.
  3. *Lỗi logic & Kiến trúc (Logic Bug)*: Tính năng chạy lệch thiết kế, tính toán sai, hoặc module giả lập không kết nối thực tế.
  4. *Bất cập nhỏ (Minor UI/UX Inconsistency)*: Lệch nhịp hiển thị, văn bản gây hiểu lầm, hoặc thiếu phản hồi trực quan.
- **Hình thức trình bày chuẩn hóa**: Bảng ma trận đối chiếu mã nguồn 1:1 phân định 3 trạng thái: `[ĐÃ VIẾT]` (Implemented), `[CHẠY ĐÚNG]` (Runtime verified), `[ĐÃ ĐƯỢC KIỂM THỬ]` (Unit test verified).

---

## 1. Overview & Core Concept

- **Mục tiêu**: Thay vì giả định hệ thống đã hoàn thiện, tiến hành rà soát phản biện từng dòng mã nguồn để tìm ra các "điểm mù" (blind spots), mâu thuẫn giữa thiết kế và thực thi, và các giả định chưa được kiểm chứng.
- **Đối tượng thụ hưởng**: Đội ngũ phát triển và người chơi, đảm bảo nền tảng kỹ thuật và cơ chế cân bằng vững chắc 100% trước khi bổ sung màn chơi, trang bị hoặc cơ chế mới.
- **Giá trị cốt lõi**:
  - Minh bạch hóa hiện trạng mã nguồn.
  - Phân loại rõ ràng giữa "code đã tồn tại" và "logic thực sự hoạt động trong game loop".
  - Thiết lập danh mục ưu tiên sửa lỗi rõ ràng, có căn cứ kỹ thuật.

---

## 2. Bảng Ma Trận Đối Chiếu 5 Cụm Tính Năng (Code-to-State Matrix)

Trạng thái được định nghĩa:
- **Đã viết (Impl)**: Mã nguồn đã có khai báo hàm/class/biến.
- **Chạy đúng (Run)**: Logic liên kết hoàn chỉnh trong gameplay loop, không bị cụt hay lỗi rẽ nhánh.
- **Đã kiểm thử (Test)**: Đã có test case tự động kiểm chứng trong test suite (`progression_rules.test.mjs`).

### Cụm 1: Hệ Thống Chiến Đấu (Combat Engine)
| Tính năng | Vị trí mã nguồn | Đã viết | Chạy đúng | Đã kiểm thử | Bằng chứng đối chiếu & Nhận định phản biện |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Bình máu (Potion)** | `game.js:88, 167, 401` | **CÓ** | **KHÔNG** | **KHÔNG** | Ban đầu `potions: 0`. Hàm `usePotion()` trừ và hồi tối đa 70 HP, có nút bấm UI, nhưng **hoàn toàn không có bất kỳ nguồn nhặt rơi hay điểm mua nào** trong game. |
| **Phản đòn (Parry)** | `game.js:346, 374, 406` | **CÓ** | **MỘT PHẦN** | **KHÔNG** | Cửa sổ `parryUntil = now + 185ms`. Tuy nhiên `btn-guard` khi thả và nhấn lại sẽ reset ngay cửa sổ mới mà **không có thời gian hồi (cooldown) hay tiêu hao thể lực**. |
| **Đỡ đòn (Block)** | `game.js:163, 374` | **CÓ** | **CÓ** | **KHÔNG** | Giảm 55% sát thương khi quay mặt đúng hướng kẻ địch. Đã kết nối với thanh máu và haptic feedback. |
| **Combo & Stun** | `progression_rules.js:2-20`, `game.js:359` | **CÓ** | **CÓ** | **CÓ** | Tỷ lệ Stun tích lũy theo số đòn trúng liên tiếp, trần theo loại vũ khí (0.18 - 0.30). Reset sau 2 đòn trượt. Có test suite xác minh. |
| **Kỹ năng Whirlwind** | `game.js:349` | **CÓ** | **CÓ** | **KHÔNG** | Tiêu tốn 30 năng lượng, AoE 145px + scale theo cấp kỹ năng, phá thùng, rung camera. |

### Cụm 2: Trí Tuệ Nhân Tạo & Boss (AI & Enemies)
| Tính năng | Vị trí mã nguồn | Đã viết | Chạy đúng | Đã kiểm thử | Bằng chứng đối chiếu & Nhận định phản biện |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Behavior Tree (Cây hành vi)** | `game.js:34-38, 329, 337-342` | **CÓ** | **KHÔNG** | **KHÔNG** | Node Sequence/Selector/Action được khởi tạo, nhưng trong `updateEnemies()` chỉ evaluate để lấy chữ `intent` in lên UI HUD. **Di chuyển và tấn công thực tế bị hardcode bằng lệnh if/else bên ngoài**. |
| **Hành vi quái tầm xa (Archer/Mage)** | `game.js:365, 370` | **CÓ** | **CÓ** | **KHÔNG** | Tự động giữ khoảng cách (kiting), bắn tên/cầu ma pháp có vận tốc. |
| **Boss 3 Pha (The Iron Warden)** | `game.js:361, 366, 371` | **CÓ** | **CÓ** | **KHÔNG** | Pha 1 chém cận chiến; Pha 2 (HP ≤ 50%) chém + 3 cầu năng lượng; Pha 3 (HP ≤ 25%) tăng tốc 55% + 5 cầu năng lượng quạt chéo. |

### Cụm 3: Kinh Tế, Rương & Tiến Trình (Economy & Progression)
| Tính năng | Vị trí mã nguồn | Đã viết | Chạy đúng | Đã kiểm thử | Bằng chứng đối chiếu & Nhận định phản biện |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Kim cương (Diamond/Gem)** | `game.js:88, 153` | **CÓ** | **KHÔNG** | **KHÔNG** | Hạ Boss nhận +12 kim cương, hiển thị trên thanh tiền tệ, nhưng **trong toàn bộ mã nguồn không có tính năng nào sử dụng kim cương**. |
| **Rương Milestone** | `progression_rules.js:53-61`, `game.js:176-194` | **CÓ** | **CÓ** | **KHÔNG** | Mua bằng Sao hoặc Vàng, mở khóa theo Chapter. Tỷ lệ rơi đồng đều theo nhóm phần thưởng. |
| **Bán trang bị** | `game.js:195-202` | **CÓ** | **CÓ** | **KHÔNG** | Thu hồi 30% giá rương của trang bị, cấm bán đồ mặc định và đồ đang trang bị. |
| **Cơ chế Anti-Farm** | `progression_rules.js:63-67`, `game.js:125` | **CÓ** | **CÓ** | **KHÔNG** | Giảm 50% vàng khi cày lại Chapter thấp hơn Chapter cao nhất đã mở khóa. |
| **Trần chỉ số (Build Ceiling)** | `progression_rules.js:36-51` | **CÓ** | **MỘT PHẦN** | **KHÔNG** | Tính toán trần công/thủ theo Chapter, nhưng đạn boss pha 3 có chỗ chưa áp trần triệt để. |

### Cụm 4: Hệ Thống Lưu Game & Bảo Mật (Save & Crypt)
| Tính năng | Vị trí mã nguồn | Đã viết | Chạy đúng | Đã kiểm thử | Bằng chứng đối chiếu & Nhận định phản biện |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Mã hóa AES-256-GCM** | `game.js:236-249` | **CÓ** | **CÓ** | **KHÔNG** | Sử dụng Web Crypto API chính quy, tạo IV/Salt ngẫu nhiên 16/12 byte. |
| **Chữ ký toàn vẹn HMAC-SHA256** | `game.js:244, 248` | **CÓ** | **CÓ** | **KHÔNG** | Ký chuỗi Salt + IV + Ciphertext, từ chối tải file nếu payload bị sửa. |
| **Bảo mật chống gian lận (Anti-tamper)** | `game.js:242` | **CÓ** | **KHÔNG** | **KHÔNG** | **Master Key được lưu dạng Base64 trần trong LocalStorage**. Bất kỳ ai mở DevTools đều đọc được khóa và tự ký lại save hợp lệ. |

### Cụm 5: Vận Hành & Kiểm Thử Hiệu Năng (Runtime Performance & QA)
| Tính năng | Vị trí mã nguồn | Đã viết | Chạy đúng | Đã kiểm thử | Bằng chứng đối chiếu & Nhận định phản biện |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Object Pooling** | `game.js:320-324, 381` | **CÓ** | **MỘT PHẦN** | **KHÔNG** | Có pool cho đạn (16), hạt (24), chữ số (12), vệt chém (6). Khi đạn đầy (16 viên), đạn mới bị hủy ngầm không báo lỗi. |
| **Rò rỉ Event Bus / Timer** | `game.js:255, 260, 315` | **CÓ** | **CÓ** | **KHÔNG** | Đã dọn listener trên scene shutdown; timer âm nhạc clear khi tắt. Chưa kiểm thử stress test kéo dài 30+ phút. |
| **Test Suite Tự Động** | `progression_rules.test.mjs:1-25` | **CÓ** | **CÓ** | **CÓ** | Chỉ bao gồm 14 phép so sánh số học cho stun và miss count. Hoàn toàn chưa kiểm thử CombatScene hay GameCoreManager. |

---

## 3. Danh Sách Lỗi & Lỗ Hổng Có Bằng Chứng (Phân Loại 4 Cấp Độ)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MA TRẬN LỖ HỔNG & LỖI KỸ THUẬT                        │
├──────────────────────┬──────────────────────────────────────────────────────┤
│ 1. CHẶN TIẾN TRÌNH   │ • BUG-01: Bình máu rơi vào vòng lặp chết (Không nguồn)│
│    (Critical)        │ • BUG-02: Kim cương tồn tại không mục đích sử dụng   │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ 2. EXPLOIT / GIAN LẬN│ • EXP-01: Lạm dụng nhấp-nhả Guard để giữ Parry vô hạn │
│    (Exploit/Balance) │ • EXP-02: Khóa mã hóa LocalStorage dễ dàng bị can thiệp│
├──────────────────────┼──────────────────────────────────────────────────────┤
│ 3. LỖI LOGIC & KIẾN  │ • LOG-01: Cây hành vi AI chỉ làm cảnh hiển thị UI   │
│    TRÚC (Logic Bug)  │ • LOG-02: Giới hạn Pool đạn khiến quái tầm xa tịt đạn │
├──────────────────────┼──────────────────────────────────────────────────────┤
│ 4. BẤT CẬP NHỎ       │ • MIN-01: Thiếu thông số so sánh trang bị trước khi đeo│
│    (Minor UX)        │ • MIN-02: Thiếu cảnh báo khi hết slot đạn trong pool │
└──────────────────────┴──────────────────────────────────────────────────────┘
```

### Chi tiết bằng chứng và kịch bản tái hiện:

#### 1. [CHẶN TIẾN TRÌNH] BUG-01: Bình máu không có nguồn thu thập
- **Bằng chứng**: `GameCoreManager.state` khởi tạo `potions: 0` (`game.js:88`). Hàm `usePotion()` (`game.js:167`) và nút `btn-potion` (`index.html:172`) đã sẵn sàng. Tuy nhiên hàm `chooseChestReward`, `onEnemyKilled`, và `breakBarrel` không hề chứa logic rơi bình máu.
- **Tác động**: Tính năng hồi phục bằng vật phẩm bị tê liệt 100% trong trải nghiệm người chơi bình thường.

#### 2. [CHẶN TIẾN TRÌNH] BUG-02: Kim cương là tiền tệ chết (Dead Currency)
- **Bằng chứng**: Tiêu diệt Boss thưởng 12 kim cương (`game.js:153`), hiển thị ở header (`index.html:115`). Nhưng trong `GameCoreManager` chỉ có kiểm tra `gold` và `starBalance`. Kim cương hoàn toàn không có chức năng tiêu dùng.
- **Tác động**: Người chơi tích lũy tiền tệ không có giá trị, làm hỏng động lực vượt ải Boss.

#### 3. [EXPLOIT] EXP-01: Lạm dụng thao tác Guard để phản đòn hoàn hảo liên tục
- **Bằng chứng**: `CombatScene.startGuard()` gán `this.parryUntil = now + 185;` (`game.js:346`). Khi người chơi nhả phím L hoặc thả tay khỏi nút Guard trên màn hình cảm ứng, `guardHeld` chuyển thành `false`. Ngay khi bấm lại, một cửa sổ 185ms mới lập tức được tạo ra mà **không có thời gian giãn cách (internal cooldown)** và không tốn tài nguyên.
- **Kịch bản khai thác**: Người chơi spam liên tục nút Guard với tần số ~5 lần/giây, xác suất kích hoạt Perfect Parry khi quái chém trúng lên tới hơn 90%, vô hiệu hóa toàn bộ độ khó chiến đấu.

#### 4. [EXPLOIT] EXP-02: Khóa mã hóa lưu trên LocalStorage dễ bị sửa đổi
- **Bằng chứng**: `SecureSaveSystem.masterBytes()` lưu `tiny_gladiators_install_key_v2` trực tiếp vào `localStorage` (`game.js:242-243`).
- **Kịch bản khai thác**: Bất kỳ người dùng nào mở DevTools cũng có thể lấy Master Key, dùng Web Crypto giải mã JSON, sửa `gold: 9999999`, tự tính lại mã băm HMAC-SHA256 và lưu đè.
- **Đánh giá bản chất**: Đây là đặc tính cố hữu của ứng dụng client-only không có backend server. Cần ghi rõ trong tài liệu kỹ thuật và giao diện rằng cơ chế này chỉ chống chỉnh sửa file thông thường, không phải là hệ thống chống gian lận máy chủ tuyệt đối.

#### 5. [LỖI LOGIC] LOG-01: Behavior Tree bị cô lập khỏi luồng điều khiển vận tốc và hành động
- **Bằng chứng**: `CombatScene.buildEnemyTree()` định nghĩa các node điều kiện và hành vi (`game.js:337-342`). Nhưng ở hàm `updateEnemies()` (`game.js:364-367`), `ctx.intent` sau khi tính toán chỉ được dùng để gửi sự kiện `bus.emit('ai:status-changed')`. Ngay dòng kế tiếp, việc quái rượt đuổi, dừng lại, hay bật thời gian windup hoàn toàn do các khối `if/else` thủ công quyết định theo khoảng cách `dist`.
- **Tác động**: Việc mở rộng AI kẻ địch trong tương lai sẽ gặp mâu thuẫn kiến trúc: sửa cây hành vi nhưng logic trong game không thay đổi.

#### 6. [LỖI LOGIC] LOG-02: Giới hạn Projectile Pool làm nghẽn đòn đánh tầm xa
- **Bằng chứng**: Pool khởi tạo cố định 16 viên đạn (`game.js:322`). Ở Boss pha 3, Boss bắn mỗi loạt 5 viên đạn với thời gian tồn tại `life = 3.8s` (`game.js:375`). Nếu có thêm Archer và Mage trên sân cùng xả đạn, hàm `spawnProjectile()` sẽ tìm không thấy đạn rảnh (`find(v => !v.active)`) và âm thầm thoát `return` mà không tạo đòn tấn công.

---

## 4. Kiến Trúc Kỹ Thuật Sau Khi Khắc Phục (Target Architecture)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                               CombatScene                               │
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐ │
│  │   Guard/Parry State Machine    │  │   Decoupled Behavior Tree      │ │
│  │  - Guard Press                 │  │  - ActionNode controls velocity│ │
│  │  - Parry Window: 185ms         │  │  - Windup / Skill transitions  │ │
│  │  - Post-Parry Cooldown: 400ms  │  │  - HUD telemetry as observer   │ │
│  └────────────────────────────────┘  └────────────────────────────────┘ │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                             Events & Direct Calls
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                             GameCoreManager                             │
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐ │
│  │   Potion Lifecycle             │  │   Diamond Currency Sink        │ │
│  │  - Barrel Drop (15% chance)    │  │  - Boss Chest purchase         │ │
│  │  - Post-boss stage reward      │  │  - Gem-to-micro-stat respec    │ │
│  │  - Potion inventory usage      │  │                                │ │
│  └────────────────────────────────┘  └────────────────────────────────┘ │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                             Serialization
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            SecureSaveSystem                             │
│  - AES-GCM + HMAC Integrity Check                                       │
│  - Clear documentation of Client-Side Anti-Tamper boundary              │
│  - Safe fallback & integrity alert modal                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Thứ Tự Ưu Tiên Sửa Lỗi Trước Khi Thiết Kế Nội Dung Mới

Lộ trình xử lý được phân kỳ nghiêm ngặt nhằm tránh việc đưa nội dung mới vào một hệ sinh thái đang có lỗ hổng:

### Đợt 1: Vá Lỗi Chặn Tiến Trình & Lỗ Hổng Khai Thác (Critical & Exploits)
1. **Khắc phục Parry Spam (EXP-01)**:
   - Thêm `parryCooldown`: Sau khi kết thúc cửa sổ 185ms hoặc sau khi thả nút Guard, người chơi phải chờ tối thiểu 350ms trước khi có thể kích hoạt cửa sổ Perfect Parry tiếp theo (thao tác đỡ thường Block vẫn duy trì được).
2. **Kích hoạt Vòng đời Bình Máu (BUG-01)**:
   - Thêm tỷ lệ rơi bình máu khi đập thùng gỗ (15%) và phần thưởng cố định 1 bình máu khi vượt qua mỗi màn Boss.
   - Bổ sung mua bình máu trong Panel Inventory với giá 150 vàng/bình.
3. **Mở cổng tiêu thụ Kim cương (BUG-02)**:
   - Bổ sung tính năng dùng kim cương: Mở Rương Tinh Anh (Elite Chest) hoặc tẩy điểm vi chỉ số (Respec Micro-stats).

### Đợt 2: Tái Cấu Trúc Kiến Trúc & Logic Lõi (Architecture & Pool)
4. **Chuẩn hóa luồng Behavior Tree (LOG-01)**:
   - Chuyển quyền điều khiển vận tốc `setVelocityX` và kích hoạt đòn đánh `windup` vào trong chính các `ActionNode` của cây hành vi, xóa bỏ khối code if/else phân tán ngoài `updateEnemies`.
5. **Nâng cấp Quản lý Đạn (LOG-02)**:
   - Tăng kích thước Projectile Pool lên 32 hoặc triển khai cơ chế thu hồi đạn cũ nhất (oldest-eviction) khi pool quá tải, tránh tình trạng quái bị câm đòn đánh.

### Đợt 3: Hoàn Thiện Kiểm Thử Tự Động & Đánh Giá Hiệu Năng (QA Verification)
6. **Mở rộng Unit Test Suite**:
   - Thêm kiểm thử cho chu kỳ bình máu, công thức tính toán vàng chống farm, và cơ chế hồi phục năng lượng/parry cooldown.
7. **Kiểm chứng hiệu năng thực tế (Stress Test)**:
   - Chạy thử nghiệm màn Boss 3 pha liên tục với 100+ vòng lặp đạn/hạt để ghi nhận FPS và mức tiêu thụ bộ nhớ JavaScript heap.

---

## 6. Kết Quả Thực Thi & Kiểm Chứng Thực Tế

Toàn bộ các hạng mục lỗi ưu tiên đã được xử lý triệt để trong mã nguồn và kiểm chứng tự động:

1. **Vá lỗ hổng spam phản đòn (EXP-01)**:
   - Tích hợp `PARRY_RULES` (`windowMs = 185`, `cooldownMs = 400`) và hàm `canParryWithCooldown()`. Người chơi chỉ có thể kích hoạt cửa sổ Perfect Parry sau mỗi 400ms; thao tác đỡ Block thông thường giảm 55% sát thương vẫn được giữ nguyên.
2. **Kích hoạt vòng đời bình máu (BUG-01)**:
   - Bổ sung mua bình máu trực tiếp trong panel `Inventory` (150 vàng/bình).
   - Thêm tỷ lệ rơi 20% khi phá thùng gỗ `breakBarrel()` và phần thưởng cố định +1 bình máu khi tiêu diệt Boss mỗi chương.
3. **Mở cổng tiêu thụ Kim Cương (BUG-02)**:
   - Bổ sung hai tính năng trong panel `Skills`:
     - **Túi giả kim (Alchemist Pouch)**: Đổi 5 kim cương lấy ngay 3 bình máu.
     - **Tẩy điểm kỹ năng (Skill Respec)**: Đổi 15 kim cương để hoàn trả 100% vàng đã nâng cấp vi chỉ số.
4. **Tái cấu trúc Behavior Tree điều khiển trực tiếp (LOG-01)**:
   - Các `ActionNode` trong `buildEnemyTree()` hiện trực tiếp chi phối vận tốc (`setVelocityX`), kiting quái tầm xa và kích hoạt `windup` đòn đánh thay vì các khối `if/else` phân tán.
5. **Nâng cấp Projectile Pool & chống tịt đạn (LOG-02)**:
   - Mở rộng kích thước pool từ 16 lên 32 đạn, bổ sung cơ chế thu hồi đạn cũ nhất (`oldest-eviction`) đảm bảo kẻ địch và Boss luôn tung đòn mượt mà.
6. **Kiểm thử tự động & Build xác minh**:
   - Bộ test `node src/game/tests/progression_rules.test.mjs` chạy thành công 100% với các kiểm thử mới.
   - Biên dịch Vite (`compile_applet`) và kiểm tra cú pháp ESLint (`lint_applet`) vượt qua hoàn hảo không có cảnh báo hay lỗi cú pháp.

