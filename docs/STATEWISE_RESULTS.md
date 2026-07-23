# State-wise Contract Results

_Generated 2026-07-23T08:23:56.478005+00:00 from each state's `models/artifacts/<state>/contract.json`. 78 of 79 states designed, 1 excluded (out of coverage); the rest fill in as `make train-all-states` runs._

**Frame is chosen by climate regime, never forced** (see `backend/backtest/contract_design.py`): chronic-moderate peril -> INCOME SMOOTHING; consistently-extreme peril -> rare-trigger CATASTROPHE insurance. Premium is the LSMC fair-value premium (`premium_to_cap * cap * representative daily wage`), each **in that state's own currency -- never converted, never mixed unlabeled**.

| State | Metro | Frame | Strike | Window | Grid-ceiling censored? | Premium (fair-value) | Premium (wage-frac) | Cat-passing | MAE vs flat |
|---|---|---|---:|---:|:---:|---:|---:|---:|---:|
| Andhra Pradesh (`IN-Andhra Pradesh`) | Amaravati | **income smoothing** | 75 | 14d | no | 329.99 INR (construction) | 0.633 | 0 | -9.6% |
| Arunachal Pradesh (`IN-Arunachal Pradesh`) | Itanagar | **income smoothing** | 90 | 14d | no | 232.07 INR (construction) | 0.526 | 0 | +40.7% |
| Assam (`IN-Assam`) | Guwahati | **income smoothing** | 85 | 14d | no | 286.05 INR (construction) | 0.603 | 0 | +40.3% |
| Bihar (`IN-Bihar`) | Patna | **income smoothing** | 75 | 14d | no | 293.20 INR (construction) | 0.649 | 0 | +42.2% |
| Chhattisgarh (`IN-Chhattisgarh`) | Bhilai | **income smoothing** | 75 | 14d | no | 299.25 INR (construction) | 0.631 | 0 | +31.6% |
| Delhi (`IN-Delhi`) | Delhi | **income smoothing** | 80 | 14d | no | 468.34 INR (construction) | 0.589 | 0 | +49.6% |
| Goa (`IN-Goa`) | Panaji | **income smoothing** | 80 | 14d | no | 318.13 INR (construction) | 0.656 | 0 | -2.4% |
| Gujarat (`IN-Gujarat`) | Ahmedabad | **income smoothing** | 75 | 14d | no | 290.92 INR (construction) | 0.628 | 0 | +27.2% |
| Haryana (`IN-Haryana`) | Faridabad | **income smoothing** | 80 | 14d | no | 285.30 INR (construction) | 0.587 | 0 | +51.8% |
| Himachal Pradesh (`IN-Himachal Pradesh`) | Pathankot | **income smoothing** | 90 | 14d | no | 268.99 INR (construction) | 0.532 | 0 | +48.0% |
| Jharkhand (`IN-Jharkhand`) | Jamshedpur | **income smoothing** | 75 | 14d | no | 299.97 INR (construction) | 0.648 | 0 | +20.6% |
| Karnataka (`IN-Karnataka`) | Bengaluru | **income smoothing** | 80 | 14d | no | 442.93 INR (construction) | 0.610 | 0 | -0.0% |
| Kerala (`IN-Kerala`) | Thiruvananthapuram | **income smoothing** | 80 | 14d | no | 410.91 INR (construction) | 0.669 | 0 | +18.4% |
| Madhya Pradesh (`IN-Madhya Pradesh`) | Indore | **income smoothing** | 75 | 14d | no | 319.20 INR (construction) | 0.633 | 0 | +33.0% |
| Maharashtra (`IN-Maharashtra`) | Mumbai | **income smoothing** | 75 | 14d | no | 367.07 INR (construction) | 0.681 | 0 | +8.6% |
| Manipur (`IN-Manipur`) | Imphal | **income smoothing** | 85 | 14d | no | 257.70 INR (construction) | 0.584 | 0 | +48.8% |
| Meghalaya (`IN-Meghalaya`) | Shillong | **income smoothing** | 80 | 14d | no | 261.73 INR (construction) | 0.623 | 0 | +47.5% |
| Mizoram (`IN-Mizoram`) | Aizawl | **income smoothing** | 80 | 14d | no | 276.87 INR (construction) | 0.628 | 0 | +37.4% |
| Nagaland (`IN-Nagaland`) | Kohima | **income smoothing** | 85 | 14d | no | 262.81 INR (construction) | 0.596 | 0 | +44.4% |
| Odisha (`IN-Odisha`) | Bhubaneswar | **income smoothing** | 70 | 14d | no | 321.75 INR (construction) | 0.666 | 0 | +12.0% |
| Punjab (`IN-Punjab`) | Ludhiana | **income smoothing** | 80 | 14d | no | 291.35 INR (construction) | 0.593 | 0 | +45.7% |
| Rajasthan (`IN-Rajasthan`) | Jaipur | **income smoothing** | 80 | 14d | no | 255.43 INR (construction) | 0.593 | 0 | +45.9% |
| Sikkim (`IN-Sikkim`) | Gangtok | **catastrophe insurance** | 98 | 14d | no | 114.60 INR (construction) | 0.260 | 2 | +38.6% |
| Tamil Nadu (`IN-Tamil Nadu`) | Chennai | **income smoothing** | 75 | 14d | no | 314.96 INR (construction) | 0.664 | 0 | -18.7% |
| Telangana (`IN-Telangana`) | Hyderabad | **income smoothing** | 75 | 14d | no | 347.86 INR (construction) | 0.650 | 0 | -11.3% |
| Tripura (`IN-Tripura`) | Agartala | **income smoothing** | 75 | 14d | no | 252.16 INR (construction) | 0.632 | 0 | +44.5% |
| Uttar Pradesh (`IN-Uttar Pradesh`) | Kanpur | **income smoothing** | 75 | 14d | no | 357.76 INR (construction) | 0.628 | 0 | +38.5% |
| West Bengal (`IN-West Bengal`) | Kolkata | **income smoothing** | 70 | 14d | no | 328.66 INR (construction) | 0.664 | 0 | +21.8% |
| Alabama (`US-Alabama`) | Birmingham | **income smoothing** | 90 | 14d | no | 30.80 USD (construction) | 0.474 | 0 | +38.8% |
| Arizona (`US-Arizona`) | Phoenix | **catastrophe insurance** | 98 | 14d | no | 27.21 USD (construction) | 0.212 | 3 | +44.5% |
| Arkansas (`US-Arkansas`) | Little Rock | **income smoothing** | 90 | 14d | no | 48.98 USD (construction) | 0.475 | 0 | +39.1% |
| California (`US-California`) | Los Angeles | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 22.44 USD (construction) | 0.152 | 1 | +16.6% |
| Colorado (`US-Colorado`) | Denver | **income smoothing** | 99 | 14d | ⚠️ **YES** | 28.27 USD (construction) | 0.219 | 0 | -6.1% |
| Connecticut (`US-Connecticut`) | Bridgeport | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 19.38 USD (construction) | 0.128 | 2 | +20.2% |
| Delaware (`US-Delaware`) | Wilmington | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 13.71 USD (construction) | 0.115 | 2 | +23.5% |
| District of Columbia (`US-District of Columbia`) | Washington,  D.C. | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 18.20 USD (construction) | 0.110 | 2 | +17.8% |
| Florida (`US-Florida`) | Miami | **income smoothing** | 65 | 14d | no | 79.15 USD (construction) | 0.679 | 0 | +29.3% |
| Georgia (`US-Georgia`) | Atlanta | **income smoothing** | 90 | 14d | no | 31.44 USD (construction) | 0.484 | 0 | +41.2% |
| Hawaii (`US-Hawaii`) | Honolulu | **income smoothing** | 65 | 14d | no | 86.16 USD (construction) | 0.687 | 0 | +26.4% |
| Idaho (`US-Idaho`) | Boise | **income smoothing** | 99 | 14d | ⚠️ **YES** | 12.49 USD (construction) | 0.192 | 0 | +16.1% |
| Illinois (`US-Illinois`) | Chicago | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 16.32 USD (construction) | 0.130 | 1 | +13.4% |
| Indiana (`US-Indiana`) | Indianapolis | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 15.42 USD (construction) | 0.237 | 1 | +32.3% |
| Iowa (`US-Iowa`) | Des Moines | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 16.65 USD (construction) | 0.256 | 1 | +32.6% |
| Kansas (`US-Kansas`) | Kansas City | **catastrophe insurance** | 98 | 14d | no | 12.21 USD (construction) | 0.188 | 3 | +21.2% |
| Kentucky (`US-Kentucky`) | Louisville | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 7.08 USD (construction) | 0.109 | 2 | +10.9% |
| Louisiana (`US-Louisiana`) | New Orleans | **income smoothing** | 80 | 14d | no | 39.27 USD (construction) | 0.604 | 0 | +41.6% |
| Maine (`US-Maine`) | Lewiston | **income smoothing** | 99 | 14d | ⚠️ **YES** | 21.14 USD (construction) | 0.167 | 0 | +15.6% |
| Maryland (`US-Maryland`) | Baltimore | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 15.32 USD (construction) | 0.114 | 2 | +19.1% |
| Massachusetts (`US-Massachusetts`) | Boston | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 18.59 USD (construction) | 0.138 | 1 | +19.4% |
| Michigan (`US-Michigan`) | Detroit | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 12.33 USD (construction) | 0.133 | 1 | +13.1% |
| Minnesota (`US-Minnesota`) | Minneapolis | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 14.04 USD (construction) | 0.141 | 1 | +11.5% |
| Mississippi (`US-Mississippi`) | Jackson | **income smoothing** | 85 | 14d | no | 35.59 USD (construction) | 0.548 | 0 | +50.0% |
| Missouri (`US-Missouri`) | St. Louis | **catastrophe insurance** | 98 | 14d | no | 21.70 USD (construction) | 0.186 | 2 | +20.5% |
| Montana (`US-Montana`) | Billings | **income smoothing** | 99 | 14d | ⚠️ **YES** | 18.24 USD (construction) | 0.198 | 0 | +9.8% |
| Nebraska (`US-Nebraska`) | Omaha | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 12.78 USD (construction) | 0.119 | 1 | +13.6% |
| Nevada (`US-Nevada`) | Las Vegas | **catastrophe insurance** | 98 | 14d | no | 22.57 USD (construction) | 0.224 | 3 | +38.9% |
| New Hampshire (`US-New Hampshire`) | Manchester | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 9.56 USD (construction) | 0.147 | 1 | +17.5% |
| New Jersey (`US-New Jersey`) | Trenton | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 16.43 USD (construction) | 0.121 | 2 | +19.2% |
| New Mexico (`US-New Mexico`) | Albuquerque | **income smoothing** | 99 | 14d | ⚠️ **YES** | 20.86 USD (construction) | 0.202 | 0 | +15.4% |
| New York (`US-New York`) | Buffalo | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 21.06 USD (construction) | 0.147 | 1 | +17.3% |
| North Carolina (`US-North Carolina`) | Raleigh | **income smoothing** | 90 | 14d | no | 31.56 USD (construction) | 0.486 | 0 | +42.3% |
| North Dakota (`US-North Dakota`) | Fargo | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 16.69 USD (construction) | 0.257 | 1 | +30.5% |
| Ohio (`US-Ohio`) | Cleveland | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 22.71 USD (construction) | 0.243 | 1 | +36.1% |
| Oklahoma (`US-Oklahoma`) | Tulsa | **income smoothing** | 90 | 14d | no | 31.36 USD (construction) | 0.483 | 0 | +39.4% |
| Oregon (`US-Oregon`) | Portland | **income smoothing** | 99 | 14d | ⚠️ **YES** | 29.70 USD (construction) | 0.220 | 0 | -21.8% |
| Pennsylvania (`US-Pennsylvania`) | Philadelphia | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 7.75 USD (construction) | 0.119 | 2 | +26.5% |
| Rhode Island (`US-Rhode Island`) | Providence | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 19.33 USD (construction) | 0.135 | 2 | +18.7% |
| South Carolina (`US-South Carolina`) | Charleston | **income smoothing** | 85 | 14d | no | 35.41 USD (construction) | 0.545 | 0 | +41.2% |
| South Dakota (`US-South Dakota`) | Sioux Falls | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 25.62 USD (construction) | 0.255 | 1 | +29.6% |
| Tennessee (`US-Tennessee`) | Memphis | **income smoothing** | 90 | 14d | no | 30.79 USD (construction) | 0.474 | 0 | +36.7% |
| Texas (`US-Texas`) | Houston | **income smoothing** | 80 | 14d | no | 38.85 USD (construction) | 0.598 | 0 | +47.5% |
| Utah (`US-Utah`) | Salt Lake City | **income smoothing** | 99 | 14d | ⚠️ **YES** | 13.15 USD (construction) | 0.202 | 0 | +16.7% |
| Vermont (`US-Vermont`) | Burlington | **income smoothing** | 99 | 14d | ⚠️ **YES** | 19.44 USD (construction) | 0.159 | 0 | +13.9% |
| Virginia (`US-Virginia`) | Virginia Beach | **income smoothing** | 90 | 14d | no | 52.01 USD (construction) | 0.484 | 0 | +39.8% |
| Washington (`US-Washington`) | Seattle | **income smoothing** | 99 | 14d | ⚠️ **YES** | 36.22 USD (construction) | 0.236 | 0 | -117.5% |
| West Virginia (`US-West Virginia`) | Charleston | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 9.14 USD (construction) | 0.117 | 2 | +15.1% |
| Wisconsin (`US-Wisconsin`) | Milwaukee | **catastrophe insurance** | 99 | 14d | ⚠️ **YES** | 9.32 USD (construction) | 0.143 | 1 | +13.1% |
| Wyoming (`US-Wyoming`) | Cheyenne | **income smoothing** | 99 | 14d | ⚠️ **YES** | 13.75 USD (construction) | 0.212 | 0 | +2.2% |

**Grid-ceiling audit**: 33 of 78 chosen strikes land on STRIKE_GRID's maximum (99) -- a flagged state's true optimum may be censored beyond the grid and must be reviewed before its premium is trusted.

## Excluded states (out of coverage)

1 state(s) are **EXCLUDED** from pricing: too few heat-exposure days to fit a defensible wage-loss distribution (minimum 30 strictly-positive loss-days). An out-of-coverage state is a documented result -- listed here explicitly, never a silent gap in the count.

| State | Metro | Reason |
|---|---|---|
| Alaska (`US-Alaska`) | Anchorage | insufficient heat-exposure days: 22 < 30 minimum strictly-positive loss-days -- state EXCLUDED from pricing (deliberate coverage boundary, not a fittable state) |

