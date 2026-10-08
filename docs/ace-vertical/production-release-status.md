# ACE production release status

Checked on 8 October 2026. The manual [production deployment](https://github.com/FSS-Ltd/pathway/actions/runs/37645052412)
completed its migration, API, admin, and web jobs successfully at merged commit
`a41e09aac3fde40f646e0242b0b8e3f0191e0122`. The API production
configuration now selects the restored London Supabase project. The prior
[failed deployment](https://github.com/FSS-Ltd/pathway/actions/runs/34189600516)
stopped at Prisma migration and skipped all three apps. Production deployment
remains manual; merging to `master` does not deploy automatically.

On 7 October, the connected Vercel API confirmed that the API
project's production `DATABASE_URL` and `SUPABASE_URL` both reference
`jzofykdzpuslpdyfovxp`. Its production Supabase secret key is present.
Admin and web use API URLs rather than direct database credentials. All three
production deployments remain READY at `a41e09aac3fde40f646e0242b0b8e3f0191e0122`;
the later merged ACE steps have not been deployed.
The connected Vercel readback confirmed both API production URLs reference the
new project, their updates predate the READY API deployment, and that
deployment's `/health` returned 200 with a database timestamp on 7 October.
On 8 October, the connected Vercel project readback reconfirmed the API
`DATABASE_URL` targets the new project's London transaction pooler, its
`SUPABASE_URL` selects the new project, and the production Supabase credential
fingerprint matches the local new-project service credential. Admin and web
both point to `https://api.nexsteps.dev`. The three READY deployments were
created after the variable updates but still serve code commit `a41e09a`.

## Delivery steps

| Step     | Scope                                                  | State   | PR and base                                                     | Checked revision and CI                                                                                                                                                                                         | Merge evidence                             |
| -------- | ------------------------------------------------------ | ------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1.1      | Require manual release and validate migration target   | Merged  | [#346](https://github.com/FSS-Ltd/pathway/pull/346) to `master` | `07cd5eeb4432a7400297865166564acb9a8032ab`; all five jobs passed in [run 37317265932](https://github.com/FSS-Ltd/pathway/actions/runs/37317265932)                                                              | `d27b9df77e4416dc2cd472abf59dc2a6568b7b2a` |
| 1.2a     | Scoped access-tag grant storage and RLS                | Merged  | [#347](https://github.com/FSS-Ltd/pathway/pull/347) to `master` | `143a7bd507127556c5322184a1c2000108fc0346`; all five jobs passed in [run 37322499197](https://github.com/FSS-Ltd/pathway/actions/runs/37322499197)                                                              | `f1674f41a39e80abb0b1cc4282056a808f83b425` |
| 1.2b     | Typed access-tag catalogue and access decision docs    | Merged  | [#348](https://github.com/FSS-Ltd/pathway/pull/348) to `master` | `a975bc89e36a12f5a5e2e3526d222e310777b1bc`; all five jobs passed in [run 37369195079](https://github.com/FSS-Ltd/pathway/actions/runs/37369195079) (attempt 4)                                                  | `173420159825f2d029c685e4b2c19a7ba07e5970` |
| 1.2c     | Delegation, grant/revoke and effective-access APIs     | Merged  | [#349](https://github.com/FSS-Ltd/pathway/pull/349) to `master` | `ff0d294709cece7f19974697ad57b0fd28f632de`; all five jobs passed in [run 37413254333](https://github.com/FSS-Ltd/pathway/actions/runs/37413254333)                                                              | `784f261ec9e2463a9a7b519328cb7d8b27560f8f` |
| 1.2d1    | Retire customer role write routes and editor           | Merged  | [#350](https://github.com/FSS-Ltd/pathway/pull/350) to `master` | `1de73eeb12a71882740f8d6dce1b8d8f7d731151`; all five jobs passed in [run 37415925535](https://github.com/FSS-Ltd/pathway/actions/runs/37415925535)                                                              | `de2ce169476b5809c3f0b46b1567b619cac6b75d` |
| 1.2d2    | Fixed-role-only assignment cutover                     | Merged  | [#351](https://github.com/FSS-Ltd/pathway/pull/351) to `master` | `a9493ed9c5d05fa86a6a96afcd077ba6004cad71`; all five jobs passed in [run 37418692392](https://github.com/FSS-Ltd/pathway/actions/runs/37418692392)                                                              | `a1f8bbbe19bc056e4e28138657f1acdd2de7bfd5` |
| 1.2d3a   | Read-only custom-assignment inventory                  | Merged  | [#352](https://github.com/FSS-Ltd/pathway/pull/352) to `master` | `9be47a8aed1bcbb808e392fb8db02df54737e6c2`; all five jobs passed in [run 37420486397](https://github.com/FSS-Ltd/pathway/actions/runs/37420486397)                                                              | `053743614742c4acec9b2180604d294f3102d2e4` |
| 1.2d3b1  | Effective-access parity preview for proposed mappings  | Merged  | [#353](https://github.com/FSS-Ltd/pathway/pull/353) to `master` | `5ddb58ea9cbf49c369590b5efa852f4b8ab20dd1`; all five jobs passed in [run 37424373226](https://github.com/FSS-Ltd/pathway/actions/runs/37424373226)                                                              | `8eaaa1c0d29a80b391855a0836931487296ed248` |
| 1.2d3b2a | Fresh effective-access reads in a write transaction    | Merged  | [#354](https://github.com/FSS-Ltd/pathway/pull/354) to `master` | `1fd7a972908141892215bbb937d00535e41f2c0e`; all five jobs passed in [run 37428121362](https://github.com/FSS-Ltd/pathway/actions/runs/37428121362)                                                              | `62e3db49cd4372e3a5908e4674f7fb7fe2185fe2` |
| 1.2d3b2b | Audited assignment retirement                          | Merged  | [#355](https://github.com/FSS-Ltd/pathway/pull/355) to `master` | `6ec5a07b779e4e091a4d41002bf404f63fa79e4d`; all five jobs passed in [run 37433372134](https://github.com/FSS-Ltd/pathway/actions/runs/37433372134)                                                              | `a7227df78a5bcc068ce2374ce88d5ba620a4b518` |
| 1.3a     | Oasis-to-NexSteps web journey parity contract          | Merged  | [#356](https://github.com/FSS-Ltd/pathway/pull/356) to `master` | `9fe3b714e5d9c131275a827db72ced62efe235a8`; all five jobs passed in [run 37435850091](https://github.com/FSS-Ltd/pathway/actions/runs/37435850091)                                                              | `676cb7bc5f3a0e3eb895ddd3fcd145ba0ec6b2d5` |
| 1.3b1    | Physical PACE inventory data and permission foundation | Merged  | [#357](https://github.com/FSS-Ltd/pathway/pull/357) to `master` | `554302c0f97e18296c6c8d705b2aaa299f9b9b36`; all five jobs passed in [run 37444424579](https://github.com/FSS-Ltd/pathway/actions/runs/37444424579)                                                              | `9aa51c88c7091974017169c0ac0a08f6dce50838` |
| 1.3b2a   | Guarded physical PACE inventory reads                  | Merged  | [#358](https://github.com/FSS-Ltd/pathway/pull/358) to `master` | `8e97d0f7f9259278f01283663f29d37c4d8f3d6e`; all five jobs passed in [run 37448346012](https://github.com/FSS-Ltd/pathway/actions/runs/37448346012)                                                              | `bb234fadaecc0194ae73086019beaaf96df701f9` |
| 1.3b2b1  | Guarded bulk physical PACE order commands              | Merged  | [#359](https://github.com/FSS-Ltd/pathway/pull/359) to `master` | `cbb388c1e5f9c9383228d1e2c55fd79926cff377`; all five jobs passed in [run 37451346773](https://github.com/FSS-Ltd/pathway/actions/runs/37451346773)                                                              | `03b62c9c152e5d755ef60e171b35441c7c7eee20` |
| 1.3b2b2  | Guarded physical PACE current-stock entry              | Merged  | [#360](https://github.com/FSS-Ltd/pathway/pull/360) to `master` | `e7db9758f1c2a3f2ef6f1ae2d60a168324d4870e`; all five jobs passed in [run 37454020484](https://github.com/FSS-Ltd/pathway/actions/runs/37454020484)                                                              | `3bba6edfee0d2bd4754841645da0cf17579bede1` |
| 1.3b2b3  | Forward-only physical PACE delivery transitions        | Merged  | [#361](https://github.com/FSS-Ltd/pathway/pull/361) to `master` | `afdadffbfcae1b6e6bf6c32c6a5cc1dcbfb61e6e`; all five jobs passed in [run 37456709818](https://github.com/FSS-Ltd/pathway/actions/runs/37456709818)                                                              | `c0fc043fcc7d90040849fad5c9a144cb4a850724` |
| 1.3b2c1  | Read-only physical PACE inventory web journey          | Merged  | [#362](https://github.com/FSS-Ltd/pathway/pull/362) to `master` | `8d99ae4ca11661a5331905726cb6a01048ae6b9f`; all five jobs passed in [run 37487356359](https://github.com/FSS-Ltd/pathway/actions/runs/37487356359)                                                              | `ae7b9aa17174b0831fbbe9ae3bfba23047a10a27` |
| 1.3b2c2  | Physical PACE order creation web control               | Merged  | [#363](https://github.com/FSS-Ltd/pathway/pull/363) to `master` | `3214a41c930edb7bfae2e18deadaf003dfab5ddb`; all five jobs passed in [run 37492380380](https://github.com/FSS-Ltd/pathway/actions/runs/37492380380)                                                              | `9b8e2d1b91f5adb34f3711ad3c2186008dfb8009` |
| 1.3b2c2r | Prior merge record and new-project cutover conditions  | Merged  | [#364](https://github.com/FSS-Ltd/pathway/pull/364) to `master` | `117f2b2fe75a38a997ffbe0fa4152ee3ced5761d`; all five jobs passed in [run 37496153641](https://github.com/FSS-Ltd/pathway/actions/runs/37496153641)                                                              | `6240e5baed782d95aa59fa6c4de16e4c87ebca61` |
| 1.3b2c3  | Physical PACE current-stock entry web control          | Merged  | [#365](https://github.com/FSS-Ltd/pathway/pull/365) to `master` | `613b2ab0f63fe8f262684121c298758df4029a0b`; all five jobs passed in [run 37499827535](https://github.com/FSS-Ltd/pathway/actions/runs/37499827535)                                                              | `6bb854387a010d8e65230a8342fbcedd6fdebceb` |
| 1.3b2c4  | Physical PACE delivery transition web control          | Merged  | [#366](https://github.com/FSS-Ltd/pathway/pull/366) to `master` | `24ac60112e1527dbb1d23b28bf44c4e69fa9dec5`; all five jobs passed in [run 37502864680](https://github.com/FSS-Ltd/pathway/actions/runs/37502864680)                                                              | `99044b3cde7f25e1c22313117768da48dc15b8af` |
| 1.3c0    | Diagnostic-results reference and design                | Merged  | [#367](https://github.com/FSS-Ltd/pathway/pull/367) to `master` | `3a957697b7b315ba94d317c46ac6fcd74f14db61`; all five jobs passed in [run 37506409613](https://github.com/FSS-Ltd/pathway/actions/runs/37506409613)                                                              | `9390d7e23375ed3c5ceb2efe3b5c7d8c94e5d1dc` |
| 1.3c1    | Diagnostic permission registry and fixed-role mappings | Merged  | [#368](https://github.com/FSS-Ltd/pathway/pull/368) to `master` | `838d6b08aec5297d0689a170343704b5a395718f`; all five jobs passed in [run 37509331904](https://github.com/FSS-Ltd/pathway/actions/runs/37509331904)                                                              | `e8661fa9cf9e86c1fcb6ad97ecbc919af6a7a3a4` |
| 1.3c2    | Diagnostic facts and tenant RLS                        | Merged  | [#369](https://github.com/FSS-Ltd/pathway/pull/369) to `master` | `4a74e073ef7835248cffdcd5b9e5480a4b2fa523`; all five jobs passed in [run 37513470766](https://github.com/FSS-Ltd/pathway/actions/runs/37513470766)                                                              | `c88b553840cbe165558144a2bb8f07bdcfda6a68` |
| DB-1     | New-project migration inventory and blocker            | Merged  | [#370](https://github.com/FSS-Ltd/pathway/pull/370) to `master` | `b311080af365db1bf6bf35cedb4b81c6e69d1ae2`; all five jobs passed in [run 37516949020](https://github.com/FSS-Ltd/pathway/actions/runs/37516949020)                                                              | `56b91b29f515e713fc931e27efa3b398850c8fe0` |
| 1.3c3    | Bounded diagnostic history API                         | Merged  | [#371](https://github.com/FSS-Ltd/pathway/pull/371) to `master` | `a475914c06e26a9d25484a99c57e8246eb022e28`; all five jobs passed in [run 37520082279](https://github.com/FSS-Ltd/pathway/actions/runs/37520082279)                                                              | `4aa865fa1dcc1d192e372ae7a8a537ab7526bd4e` |
| 1.3c4    | Audited diagnostic record and retraction API           | Merged  | [#372](https://github.com/FSS-Ltd/pathway/pull/372) to `master` | `e4a8faa3a4d891be0cff9bc811824117db2763df`; all five jobs passed in [run 37523331326](https://github.com/FSS-Ltd/pathway/actions/runs/37523331326)                                                              | `85a3743b90b6e297a9a661943a64ef87525edf53` |
| 1.3c5a   | Read-only diagnostic history web journey               | Merged  | [#373](https://github.com/FSS-Ltd/pathway/pull/373) to `master` | `121c0b77ca26e1fd53f29b1a93b051ffaef42878`; all five jobs passed in [run 37527866517](https://github.com/FSS-Ltd/pathway/actions/runs/37527866517)                                                              | `55f1a7a55496c07ccacc765819a9b0cf2c1fc770` |
| 1.3c5b   | Diagnostic record and retraction web controls          | Merged  | [#375](https://github.com/FSS-Ltd/pathway/pull/375) to `master` | `53822bb064603e033ccfe4ebf7bbf0517c530f40`; all eight checks passed (runs below)                                                                                                                                | `eae1e4bb2649a952d603c52a6bff2d29317d4ed7` |
| 1.3d0    | Attendance correction history and site-scope contract  | Merged  | [#376](https://github.com/FSS-Ltd/pathway/pull/376) to `master` | `ad074caa2ade8440bc327da02a866e7836de0c1c`; all eight checks passed (runs below)                                                                                                                                | `b63718871fe4ac3f84758a7594056e2e7f39a012` |
| 1.3d1    | Attendance correction-event storage and RLS            | Merged  | [#377](https://github.com/FSS-Ltd/pathway/pull/377) to `master` | `cd9122205a7ba1f34d8c2b68c9b58d3a5957e80d`; all eight checks passed (runs below)                                                                                                                                | `a3895633db6553a01bab4d9f07ef62aa71c21561` |
| 1.3d2    | Atomic attendance correction writers                   | Merged  | [#378](https://github.com/FSS-Ltd/pathway/pull/378) to `master` | `4581d5f3f78dfa717fd78c915d018e297a25733a`; all eight checks passed (runs below)                                                                                                                                | `420c4d234b7cbb9cc33c4e4e374f1126a881bf61` |
| 1.3d3    | Bounded attendance correction history API              | Merged  | [#379](https://github.com/FSS-Ltd/pathway/pull/379) to `master` | `6d7f2035be51c6d76f80a00e28f44651815cb013`; all eight checks passed (runs below)                                                                                                                                | `19c045381d856e0b6b3372f3929b63addf8bf40b` |
| 1.3d4    | Staff attendance correction history web journey        | Merged  | [#380](https://github.com/FSS-Ltd/pathway/pull/380) to `master` | `a65252e3c0211cfb6aa78f0d0d06bd9abda35e93`; all eight checks passed (runs below)                                                                                                                                | `cf0f1d9ac20c25cd97305bae0f72c6ad5cacd0be` |
| 1.3d5    | Daily attendance register contract                     | Merged  | [#381](https://github.com/FSS-Ltd/pathway/pull/381) to `master` | `8d98fb4a4a70a0d8c7ffd45ef02b7304acbec070`; all eight checks passed (runs below)                                                                                                                                | `2319e7af3dcd83f6775fe906cb0c4208fbc4250d` |
| DB-2a    | New-project backup and Storage restore preflight       | Merged  | [#382](https://github.com/FSS-Ltd/pathway/pull/382) to `master` | `1292f15d45c708d1bb260cea9a8ccdbdb8b1c504`; all eight checks passed (runs below)                                                                                                                                | `4b04a946134c1b16e42cacb719814e1368c2660b` |
| DB-2b    | Candidate database and Storage restore                 | Merged  | [#383](https://github.com/FSS-Ltd/pathway/pull/383) to `master` | `744001b253fab7131e492ad43723b283a2573e4a` checked head; all eight checks passed: [CI run 37579404044](https://github.com/FSS-Ltd/pathway/actions/runs/37579404044), CodeQL run 37579399674.                    | `f3301adedbe9521280463eda8e983b88fdaab3e5` |
| DB-2c1   | Portable ACE fact trigger checks                       | Merged  | [#384](https://github.com/FSS-Ltd/pathway/pull/384) to `master` | `d617c093120206611f59bf709f84c447c06834c3`; all eight checks passed: CI run 37581566481, CodeQL run 37581562551. Target migration and rollback probe passed.                                                    | `e7a804fb14658ee8c309b3d02080d64cd6c8479f` |
| DB-2c2   | Portable student portal policy trigger                 | Merged  | [#385](https://github.com/FSS-Ltd/pathway/pull/385) to `master` | `39d9eac5c83eff82e5d2031a7f0b51a67a3aa07c`; all eight checks passed: CI run 37583372509, CodeQL run 37583368972. Target migration and rollback probe passed.                                                    | `4c44f0ad92252cf876d702f1b980e311022e9f2b` |
| DB-2c3   | Portable ACE record actor membership trigger           | Merged  | [#386](https://github.com/FSS-Ltd/pathway/pull/386) to `master` | `9dee34ed052cbb5a192cd851ef7e2f888c82023c`; all eight checks passed: CI run 37585173142, CodeQL run 37585167935. Target migration and rollback probe passed.                                                    | `2df25142ebe8c8f1df741d0c44946c8edc35210e` |
| DB-2c4   | Portable message conversation creator trigger          | Merged  | [#387](https://github.com/FSS-Ltd/pathway/pull/387) to `master` | `e5d09084a439121d76332a4c7f46ae88172013f6`; all eight checks passed: CI run 37586852136, CodeQL run 37586847867. Target migration and rollback probe passed.                                                    | `d7eeb72b0a9f009a55e2d6dc8445a803d9f4a62f` |
| DB-2c5   | Portable message participant trigger                   | Merged  | [#388](https://github.com/FSS-Ltd/pathway/pull/388) to `master` | `b819d9892c105ee1a642d26365fffea23bfe1538`; all eight checks passed: CI run 37589121109, CodeQL run 37589117201. Target migration and rollback probe passed.                                                    | `e714aefcd10059c315f54bd0857800c577cdbcee` |
| DB-2c6   | Portable notice audience eligibility                   | Merged  | [#389](https://github.com/FSS-Ltd/pathway/pull/389) to `master` | `0eb7a2039c97f5ffcfe0e6d953c33f2f3362abfa`; all eight checks passed: CI run 37591629004, CodeQL run 37591622867. Target migration and rollback probe passed.                                                    | `102c0361310bb44d246c93fe9e537f53749bbbfd` |
| DB-2d1   | Audit required RLS across restored split schemas       | Merged  | [#390](https://github.com/FSS-Ltd/pathway/pull/390) to `master` | `0a73a9db8fcea9a4ea398fbbfe60b7875716c4e3`; all eight checks passed: CI run 37594263803, CodeQL run 37594259791. Target read-only gate reports 63 required tables with grants.                                  | `1eb3e75c5c2b561cf3df3d21e80457b68a77f378` |
| DB-2d2   | Revoke restored Data API table grants                  | Merged  | [#391](https://github.com/FSS-Ltd/pathway/pull/391) to `master` | `b8c91a200c8857ce9a51a3d35e04fc8e004ac198`; all eight checks passed: CI run 37596845150, CodeQL run 37596839569. Target migration applied; direct and default table grants are zero, with row counts unchanged. | `26041370c9048861fd577c7c5185141e0ad58b5f` |
| DB-2d3   | Accept public-qualified reviewed role policy text      | Merged  | [#392](https://github.com/FSS-Ltd/pathway/pull/392) to `master` | `ba717d409e129390c5ee3e2a9475fb79fc92f3e4`; all eight checks passed: CI run 37598968312, CodeQL run 37598963345. Strict target gate passes both schemas.                                                        | `22a66d2e6eb7a8c5634fcc85d793ef6e3d29a173` |
| DB-2e1   | Audit restored migration-history exceptions            | Merged  | [#393](https://github.com/FSS-Ltd/pathway/pull/393) to `master` | `a58a5a47ac035b94e43db0614d719a2e63cafa7c`; all eight checks passed: CI run 37601481964, CodeQL run 37601476750.                                                                                                | `1c299442a19e99a023366d315be0ee467d6a74ce` |
| DB-2e2   | Restrict restored RLS event-trigger API execution      | Merged  | [#394](https://github.com/FSS-Ltd/pathway/pull/394) to `master` | `ffce7e00987fd7870a3b5456357c0b5b3e44d63e`; all eight checks passed: CI run 37604158878, CodeQL run 37604165904. Target migration applied and verified.                                                         | `6dd39e8f8f9d0ae6ac50a0fe77101e7c6b70e44b` |
| DB-2f    | Verify restored database and Storage checkpoint        | Merged  | [#400](https://github.com/FSS-Ltd/pathway/pull/400) to `master` | `76641f23be9596d18335305b96365cfda0e1685a`; all eight checks passed: CI run 37619741884, CodeQL run 37619737170.                                                                                                | `3bc72df48bd4be7a7e8dda547522e5e8a48bebc2` |
| 1.3e0    | ACE messaging API and web contract                     | Merged  | [#395](https://github.com/FSS-Ltd/pathway/pull/395) to `master` | `7d348e56a0311003c68d76861b050196c8fb6d73`; all eight checks passed: CI run 37607152849, CodeQL run 37607148259.                                                                                                | `523c9bebf28290830836e0607cb0083510fb01d7` |
| 1.3e1a   | Scoped staff conversation list API                     | Merged  | [#396](https://github.com/FSS-Ltd/pathway/pull/396) to `master` | `638ff09b7431905f99761040d5b245a066d9d159`; all eight checks passed: CI run 37611227224, CodeQL run 37611226280.                                                                                                | `b5bfdebb545b7676dd9871883780c59cdd8f1b85` |
| 1.3e1b   | Scoped staff message history API                       | Merged  | [#397](https://github.com/FSS-Ltd/pathway/pull/397) to `master` | `c8bd8ae5cb4da0ad9b908f7356d33d4e82656dd5`; all eight checks passed: CI run 37613024233, CodeQL run 37613023426.                                                                                                | `6e30ba5c7f84a4bd7e325f048e808f6ef5017244` |
| 1.3e1c   | Scoped staff read-cursor API                           | Merged  | [#398](https://github.com/FSS-Ltd/pathway/pull/398) to `master` | `af62295036f3a12c5140da3e41ddd1d89da5758c`; all eight checks passed: CI run 37615071206, CodeQL run 37615067768.                                                                                                | `cd673cb18b3beff7de00b3903c6b31567546ef11` |
| 1.3e2a   | Idempotent staff direct conversation creation          | Merged  | [#399](https://github.com/FSS-Ltd/pathway/pull/399) to `master` | `b2b640f5048cb9beec1157bb9f7e0750e5c07f07`; all eight checks passed: CI run 37617805922, CodeQL run 37617802053.                                                                                                | `d480172e7b1573544ceb39ff9550a28d53848211` |
| 1.3e2b   | Scoped staff message send API                          | Merged  | [#401](https://github.com/FSS-Ltd/pathway/pull/401) to `master` | `77fe27f3a5a166d239318d91444a81dcfb41fb5c`; all eight checks passed: CI run 37623067709, CodeQL run 37623060227.                                                                                                | `f5e2f7e25a371d022db8bd67c619c087e60ff4cd` |
| DB-2g    | Project-safe production environment preparation        | Merged  | [#402](https://github.com/FSS-Ltd/pathway/pull/402) to `master` | `9dd57ad967110c7fa29255ae317a3ee667dad977`; all eight checks passed: CI run 37626233704, CodeQL run 37626227019.                                                                                                | `35cb6cba8da6b42e74e94eda13b4f01bdcecb055` |
| 1.3e3a   | Staff messaging web journey                            | Merged  | [#404](https://github.com/FSS-Ltd/pathway/pull/404) to `master` | `ec8b73b3c4142bc3af0bfaf3f7ff017bf0dbbd6f`; all eight checks passed: CI run 37632328840, CodeQL run 37632323368.                                                                                                | `8e310163e472ca223d03fce1d5f27c8618b2ded5` |
| DB-2h    | Pin restored trigger-function search paths             | Merged  | [#405](https://github.com/FSS-Ltd/pathway/pull/405) to `master` | `814bf9a8df64c1433ae11ee89fb11dba50ad85ac`; all eight checks passed: CI run 37638889700, CodeQL run 37638879624.                                                                                                | `26efb8040bd3dcbc39388eb7bc786b3933d15dfd` |
| 1.3e3b1  | Scoped staff recipient discovery API                   | Merged  | [#406](https://github.com/FSS-Ltd/pathway/pull/406) to `master` | `c35f07c90326683389c8a5a9b808516f17369331`; all eight checks passed: CI run 37643791257, CodeQL run 37643776507.                                                                                                | `a41e09aac3fde40f646e0242b0b8e3f0191e0122` |
| DB-2i    | New-project production cutover                         | Merged  | [#407](https://github.com/FSS-Ltd/pathway/pull/407) to `master` | `a45bfb654344cc04042a7b0aa0ecf08457c036de`; all eight checks passed: CI run 37647704662, CodeQL run 37647698814. Production deploy run 37645052412 passed.                                                      | `9483ea3f84736e169f96638eb08f14d16ebd7718` |
| REL-1    | Authenticated admin post-deploy smoke                  | Merged  | [#417](https://github.com/FSS-Ltd/pathway/pull/417) to `master` | `3f5c0567e569fb1fe2f7029ccaeb59a1134bd60d`; all eight checks passed: CI run 37679071517, CodeQL run 37679066730.                                                                                                | `2b70c122f0ea0bd161952be732557b94887b1a31` |
| 1.3e3b2  | Scoped staff direct conversation web control           | Merged  | [#408](https://github.com/FSS-Ltd/pathway/pull/408) to `master` | `cfc654754a680baeffb0b93e5151e321b970d320`; all eight checks passed: CI run 37652063721, CodeQL run 37652056053.                                                                                                | `99f671de57e0031c80ea6b7d48907924643d7608` |
| 1.3e3c   | Scoped staff unread counts and list badges             | Merged  | [#409](https://github.com/FSS-Ltd/pathway/pull/409) to `master` | `87214821eb625ee211945d5a26717c92d9e12266`; all eight checks passed: CI run 37656203634, CodeQL run 37656189481.                                                                                                | `aac2f36551a793b56cf6fdbeb5a56eaa268b18ac` |
| 1.3e3d   | Scoped direct-message read feedback                    | Merged  | [#411](https://github.com/FSS-Ltd/pathway/pull/411) to `master` | `223df300078c50882000fd6271c4fe7fec3a440f`; all eight checks passed: CI run 37661038756, CodeQL run 37661033054.                                                                                                | `ac1d2feb66e24d1b5e5f4f27669d30a6e550b03e` |
| 1.3f1    | C02 subject placement progress baseline                | Merged  | [#413](https://github.com/FSS-Ltd/pathway/pull/413) to `master` | `677860b0f7dc9e00dfdd38806a7a7a71137c7470`; all eight checks passed: CI run 37668386401, CodeQL run 37668381804.                                                                                                | `3b5a86bc4887bca1b0f7e49b7e92c0318bb0de69` |
| 1.3f2    | C01 PACE policy web settings                           | Merged  | [#415](https://github.com/FSS-Ltd/pathway/pull/415) to `master` | `6b4c85663b22c5faa8b9e825a2f056e84281a6f1`; all eight checks passed: CI run 37674606330, CodeQL run 37674600785.                                                                                                | `47b11a8ec3461db3d0bfeb03475b8e8dbae6231a` |
| 1.3f3a   | ACE core site-scoped subject catalogue API             | Merged  | [#419](https://github.com/FSS-Ltd/pathway/pull/419) to `master` | `8b0f384ec92a7b8191a0fd6293129fc13e384d6f`; all eight checks passed: CI run 37683959404, CodeQL run 37683952847.                                                                                                | `84f2a8a76492dac78618b67234eaddfd5932c412` |
| 1.3f3b   | ACE core subject catalogue web setup                   | Merged  | [#421](https://github.com/FSS-Ltd/pathway/pull/421) to `master` | `c254e6a7b3a8d3b712fd5ca956cc108879f76a32`; all eight checks passed: CI run 37688482462, CodeQL run 37688478701.                                                                                                | `a8b597b4ba51edbfcba77f0222971ed9eb4cab24` |
| 1.3g1    | Daily register year-band and staff scope foundation    | Merged  | [#423](https://github.com/FSS-Ltd/pathway/pull/423) to `master` | `876167f2790e870f93fc9f99e28e3bd791a49aa7`; all eight checks passed: CI run 37692936905, CodeQL run 37692931234.                                                                                                | `ce4053301b3de63927a0f045c7ad0f3620c7083b` |
| 1.3g1a   | Portable year-band membership guard                    | Merged  | [#425](https://github.com/FSS-Ltd/pathway/pull/425) to `master` | `be305b83748d3cbf27adabf19a4525d03213e4b7`; all eight checks passed: CI run 37696081534, CodeQL run 37696076657.                                                                                                | `a748e14bd1cb4a20509bcce4d199ccd44de6ef20` |
| 1.3g2    | Dated school enrolment foundation                      | Merged  | [#427](https://github.com/FSS-Ltd/pathway/pull/427) to `master` | `871b485a69e60baceae767a619304c93ddb9475d`; all eight checks passed: CI run 37699275536, CodeQL run 37699271978.                                                                                                | `5cf9634481cdbb2da0b63b4fbe6ac788046878a8` |
| 1.3g3    | Explicit site teaching dates                           | Merged  | [#429](https://github.com/FSS-Ltd/pathway/pull/429) to `master` | `a360d9ec66847780bd432e3a05914183cbd9c6c7`; all eight checks passed: CI run 37702284432, CodeQL run 37702280876.                                                                                                | `52f8c51d9a892d6067722d0dba02f036eb564960` |
| 1.3g4    | Daily attendance fact and correction-event foundation  | Merged  | [#431](https://github.com/FSS-Ltd/pathway/pull/431) to `master` | `76fdaace01d5e7471daa626c00ab5b475422cff1`; all eight checks passed: CI run 37706815302, CodeQL run 37706809864.                                                                                                | `3095b3cdae419e4052b1e02a550c660a662fb864` |
| 1.3g5    | Scoped daily-register staff read API                   | Merged  | [#433](https://github.com/FSS-Ltd/pathway/pull/433) to `master` | `06aad2c5ba687c5f9a66ecb48ac0f35eff9b628a`; all eight checks passed: CI run 37709708490, CodeQL run 37709703647.                                                                                                | `e0d43785eb9b592d0f2db4bcdfd4dee97d780c75` |
| 1.3g6    | Atomic daily-register mark and correction write API    | Merged  | [#435](https://github.com/FSS-Ltd/pathway/pull/435) to `master` | `27a814c792180cb15fbb7a67170528198c437563`; all eight checks passed: CI run 37712759665, CodeQL run 37712756595.                                                                                                | `69641dae68c1db991a4193d3b34ff6f5f9555ea4` |
| 1.3g7    | Scoped daily correction-history read API               | Merged  | [#437](https://github.com/FSS-Ltd/pathway/pull/437) to `master` | `923a352f80476722d2b20a84448cd9c46850fa5d`; all eight checks passed: CI run 37715465693, CodeQL run 37715461713.                                                                                                | `be87f6344a694007315c8fcc2c7a2ddeae6ae866` |
| 1.3g8    | ACE staff daily-register web journey                   | Merged  | [#439](https://github.com/FSS-Ltd/pathway/pull/439) to `master` | `3c3fd705446b388a198f297132285cb7082bf424`; all eight checks passed: CI run 37718515055, CodeQL run 37718511575.                                                                                                | `fff8e69087ef313ab80c640c625af5763b2d83c4` |
| 1.3g9    | Student self-scoped daily mark history API             | Merged  | [#441](https://github.com/FSS-Ltd/pathway/pull/441) to `master` | `46cfbf3c464c4ad51fb4658577cf202b08018397`; all eight checks passed: CI run 37722060232, CodeQL run 37722057745.                                                                                                | `3000b27f2c0fdfd21c5649848c3afa0b8dbee696` |
| 1.3b2+   | ACE core web journey slices                            | Planned | Pending                                                         | Pending                                                                                                                                                                                                         | Pending                                    |
| 1.4      | Paid add-ons and entitlement billing                   | Planned | Pending                                                         | Pending                                                                                                                                                                                                         | Pending                                    |
| 1.5      | Shared web UI and messaging finish                     | Planned | Pending                                                         | Pending                                                                                                                                                                                                         | Pending                                    |

Step 1.3g4 is merged after the corrected integration assertions passed on the
final PR revision. The daily fact and correction-event schema has not been
applied to the production database; live migrations remain deferred as agreed.
Step 1.3g5 is merged after disposable-Postgres integration verified the
scoped staff roster and fixed-leader view. Step 1.3g6 is merged after CI
Postgres ran the daily write suite and all eight required checks passed. The
bounded correction-history read in step 1.3g7 is merged after CI Postgres ran
68 integration suites and 431 tests, including the daily history suite. Step
1.3g8 adds the staff register web journey after the admin interaction test and
all eight CI checks passed. Step 1.3g9 adds a student-only daily history read
after its identity-link, portal-policy, date-boundary and cross-site integration
checks passed on the corrected PR revision. Parent and student web, exports,
production migration and deployment remain deferred.

Step 1.3g10's linked-parent daily history API merged in
[PR #443](https://github.com/FSS-Ltd/pathway/pull/443) at
`12196b9c17a3c94bc4ff6474b8dd9d0ad71d4f36`. All eight checks passed on
head `e28d067c875e1accc98581a575f1725430c17066` (CI run 37724622686;
CodeQL run 37724617494). CI's disposable PostgreSQL ran the positive and
denied relationship, date, site, and revocation request tests. Local lint,
typecheck, API build, unit and formatting checks also passed. The local
database-backed test command skipped assertions because its disposable
PostgreSQL was unavailable. Parent and student web, exports, production
migration and deployment remain open.

Step 1.3g10a is in [PR #445](https://github.com/FSS-Ltd/pathway/pull/445),
implementing the organisation parent-portal switch guard for the linked-child
attendance read. The prior 1.3g10 route did not recheck this existing release
control. The fix and its disabled/enabled request test await database-backed
CI before merge.

Step 1.3e3c was merged in [PR #409](https://github.com/FSS-Ltd/pathway/pull/409)
after all eight checks passed on its final revision. Its staff unread-count
journey is merged but is not in the current manual production deployment.
Step 1.3e3d was merged in [PR #411](https://github.com/FSS-Ltd/pathway/pull/411)
after all eight checks passed, including 59 integration suites and 401 tests
against CI Postgres. Its direct-message read feedback is also awaiting the
next gated manual production deployment.

Step 1.3f1 was merged in [PR #413](https://github.com/FSS-Ltd/pathway/pull/413)
after all eight checks passed on its final revision, including PostgreSQL
integration coverage for the placement/projection reset. Its C02 work is merged
but remains outside the earlier manual production deployment.

Step 1.3f2 was merged in [PR #415](https://github.com/FSS-Ltd/pathway/pull/415)
after all eight checks passed on its final revision. Academic setup now exposes
the existing audited, site-scoped PACE policy, with permission-aware editing,
optimistic conflict recovery, and site-switch resets. ACE core subject setup
continues with its Academic setup web screen; authenticated staging and
production verification are still required before release.

Step 1.3f3a was merged in [PR #419](https://github.com/FSS-Ltd/pathway/pull/419)
after all eight checks passed on its final revision, including the PostgreSQL
integration suite. Step 1.3f3b was merged in
[PR #421](https://github.com/FSS-Ltd/pathway/pull/421) after all eight checks
passed on its final revision. The site-scoped subject API and Academic setup
screen are merged but not yet in the current manual production deployment.
Authenticated cross-site browser verification remains a release gate.

Release step REL-1 was merged in [PR #417](https://github.com/FSS-Ltd/pathway/pull/417)
after all eight checks passed on its final revision. The manual smoke workflow
can now authenticate to an exact protected admin deployment and verify the
expected Clerk sign-in redirect. It has not yet been dispatched against a
new production deployment; staging and authenticated user journeys remain open.

For step 1.3c5b, all eight checks passed on the checked revision in
[CI run 37532490552](https://github.com/FSS-Ltd/pathway/actions/runs/37532490552)
and [CodeQL run 37532483173](https://github.com/FSS-Ltd/pathway/actions/runs/37532483173).
For step 1.3d0, all eight checks passed on the checked revision in
[CI run 37534452075](https://github.com/FSS-Ltd/pathway/actions/runs/37534452075)
and [CodeQL run 37534447405](https://github.com/FSS-Ltd/pathway/actions/runs/37534447405).
For step 1.3d1, all eight checks passed on the checked revision in
[CI run 37538708174](https://github.com/FSS-Ltd/pathway/actions/runs/37538708174)
and [CodeQL run 37538703699](https://github.com/FSS-Ltd/pathway/actions/runs/37538703699).
For step 1.3d2, all eight checks passed on the checked revision in
[CI run 37544209044](https://github.com/FSS-Ltd/pathway/actions/runs/37544209044)
and [CodeQL run 37544202911](https://github.com/FSS-Ltd/pathway/actions/runs/37544202911).
For step 1.3d3, all eight checks passed on the checked revision in
[CI run 37547225142](https://github.com/FSS-Ltd/pathway/actions/runs/37547225142)
and [CodeQL run 37547222239](https://github.com/FSS-Ltd/pathway/actions/runs/37547222239).
For step 1.3d4, all eight checks passed on the checked revision in
[CI run 37550770462](https://github.com/FSS-Ltd/pathway/actions/runs/37550770462)
and [CodeQL run 37550765654](https://github.com/FSS-Ltd/pathway/actions/runs/37550765654).
For step 1.3d5, all eight checks passed on the checked revision in
[CI run 37553726682](https://github.com/FSS-Ltd/pathway/actions/runs/37553726682)
and [CodeQL run 37553723755](https://github.com/FSS-Ltd/pathway/actions/runs/37553723755).
For step DB-2a, all eight checks passed on the checked revision in
[CI run 37555887584](https://github.com/FSS-Ltd/pathway/actions/runs/37555887584)
and [CodeQL run 37555886228](https://github.com/FSS-Ltd/pathway/actions/runs/37555886228).

Step 1.1 makes production deployment explicit and accepts only the configured
Supabase project's direct database endpoint or shared session pooler on port
5432 for migrations. It rejects a transaction pooler URL, missing credentials
and a project mismatch before Prisma starts.
The old production project remains inaccessible. The new project has data and
migrations, with release blockers recorded below. Later steps start only after
the preceding PR has passing CI on its current revision and is merged into
`master`.

After DB-2h merged, its reviewed migration was applied to the off-traffic new
project. It has 107 finished migration records and 105 migration directories
in this repository. `prisma migrate deploy` succeeded, while `prisma migrate
status` still exits with the two missing historical files and one changed
historical checksum documented in the restore runbook. The direct execution grants on
`app.rls_auto_enable()` are gone for `PUBLIC`, `anon`, and `authenticated`;
its enabled RLS event trigger and owner execution remain. Four trigger
functions now use an empty search path, with all 11 learning membership
triggers attached. The strict public and app RLS gates pass. The 28 blog
posts, Victorious Kids organisation, 71 users, and 32 Storage objects remained
intact at that off-traffic checkpoint. Production was switched in DB-2i below.

The 1.3d1 attendance event migration and its following atomic-writer step must
reach production in the same gated release. Corrections made after the one-time
legacy backfill but before the writer is deployed would otherwise lack events.

## New Supabase project cutover conditions

The target is a **new project in the new organisation**, not a transfer of the
existing project. Creating that empty project is separate from migrating its
data and switching production traffic. The source project remains intact until
the restored target is verified and a rollback window has passed. No live copy
or cutover can be verified while the source is unavailable unless a complete,
restorable backup and its storage objects have already been independently
verified.

The owner chose the 7 September database and Storage archives as the final
source snapshot on 7 October, accepting that later writes cannot be checked
against the inactive source and may be absent. The target matches the archived
application row counts and Storage bytes. Production was switched to the new
project on 7 October; current-source parity remains unverified.

1. Record the source and target project refs, region, required extensions,
   database roles, migration history, storage buckets and object counts, Auth
   configuration if used, scheduled jobs, Edge Functions and external webhook
   destinations. Confirm the target region and data residency requirements
   before creating the project. Keep credentials and backup files in approved
   secret storage, outside the repository.
2. Restore a verified, point-in-time source backup into a **disposable target**
   first. For a target in another organisation, use Supabase's documented
   backup/restore procedure for a newly created project. The dashboard's
   physical "Restore to a new project" route has eligibility and region
   constraints; do not assume it can place a clone in another organisation.
   Reconcile the Prisma migration table before applying only genuinely pending
   migrations. Restore database roles and any encryption key material required
   by encrypted data through the documented secure process.
3. Copy Supabase Storage objects separately, then compare bucket inventories
   and representative object checksums. Recreate project-specific settings,
   keys, functions, Realtime configuration, and any Auth settings in use.
   Inspect scheduled jobs and webhook destinations before restore. A physical
   restore starts copied `pg_cron`, `pg_net` and other external operations
   immediately, with no pause option; use a logical restore if they must be
   inspected or removed before activation.
4. In staging, compare table counts and sampled records, verify tenant RLS,
   fixed-role and tag access, linked-child scope, uploads/downloads, workers,
   billing webhooks and critical API/admin/configurator journeys. Record the
   exact source snapshot and target migration status. Resolve differences
   before production cutover.
5. Keep the inactive source free of new writes. The owner accepted the verified
   7 September archive pair as the final snapshot, so there is no later delta
   to replay from current evidence. If source access returns before cutover,
   stop and compare later writes before switching traffic. Update
   `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, storage keys and relevant
   secrets in every deployment surface. In particular,
   `scripts/prepare-production-env.mjs` now derives the project URL from
   `DATABASE_URL` and requires a verified host before converting direct URLs;
   prepare and verify target credentials before synchronization. The migration
   workflow validates that `DIRECT_URL` and
   `SUPABASE_URL` select the same project and that migration uses port 5432.
6. Dispatch the manual production workflow only after the staging gate and
   cutover authorization. Smoke-test the deployed commit and monitor errors,
   queues and external callbacks. Keep the old project read-only and recoverable
   through the agreed rollback window; do not restore old traffic after new
   writes without reconciling them.

Supabase references: [backup and restore into a new
project](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[physical restore limits](https://supabase.com/docs/guides/platform/clone-project),
and [project transfer](https://supabase.com/docs/guides/platform/project-transfer).

### Migration checkpoint — 2026-10-06

- Source `fkajodqkxysfcnfhizwn` (`nexsteps`, Ireland `eu-west-1`) matches the
  local production configuration. Supabase reports it `INACTIVE`; a read query
  timed out. Its restore endpoint rejected the request because the source
  organisation has unpaid invoices. No verified source snapshot was accessible
  for parity checks or export.
- Target `jzofykdzpuslpdyfovxp` (`NexSteps`, London `eu-west-2`) is healthy.
  Read-only inventory found zero `app` tables, Supabase Auth users, Storage
  buckets and Storage objects. Auth0 remains the application's identity provider.
- No data, migrations, Storage objects, deployment secrets, or traffic were
  moved. Resume only when the source organisation can restore the project or a
  complete, verified database backup **and** Storage export are available.
  Then follow the cutover conditions above, starting with a disposable restore.
- After PR #371 merged, source project status remained `INACTIVE` and the target
  remained `ACTIVE_HEALTHY`. The target-scoped Supabase MCP server is installed
  in Codex; its OAuth login attempt timed out, so authentication has not been
  verified. This does not change the source-data blocker above.
- A later manual OAuth attempt reached the Supabase sign-in choice, but Codex's
  automatic approval review blocked selecting the existing identity because
  that would share account profile details with Supabase. The user has been
  asked to approve that specific sign-in action. MCP authentication remains
  unverified; the connector's read-only project checks do not establish a
  complete source backup.
- On 7 October, a fresh read-only connector check still reported source
  `INACTIVE` and target `ACTIVE_HEALTHY`. No export, restore, Storage copy,
  migration, or cutover was attempted after step 1.3d2 merged.

### Backup preflight — 2026-10-07

The owner supplied a database backup and Storage archive. The
[new-project restore runbook](runbooks/new-project-backup-restore.md) records
their integrity, row and object inventory, target checks, restore procedure,
and acceptance evidence. The archives agree on all 32 Storage objects. The
database contains 28 published blog posts and a Victorious Kids master
organisation. The archive filename suggests 7 September; snapshot freshness
has not been established. The target Postgres URL is now in an ignored local
`.env`, and a read-only `psql` query verified the target connection and absence
of the application `Org` table. No database or Storage restore has been
attempted.

Step DB-2b has rehearsed the target-scoped SQL in disposable local Postgres 17:
all 1,820 archived rows matched across the 165 available table sections. The
empty Vault section was unavailable locally; Vault is installed on the target.
The owner confirmed this is the latest available database and Storage backup
pair, and supplied the new-project Storage credential in the ignored root
`.env`. The source remains unavailable for an independent post-snapshot delta.
The checked replay helper produces target-scoped SQL in a private temporary
file and rejects archive drift or unexpected `psql` commands. The Storage
restore command validated all 32 paths and its transfer tests passed.

The [DB-2b target restore evidence](runbooks/new-project-backup-restore.md#target-restore-evidence--7-october-2026)
records the live result: all 131 archived application table sections matched,
all 32 Storage files were uploaded and downloaded with matching hashes, and
four pending Prisma migrations applied. The application still uses the old
production project. The new target is not approved for traffic: migration
history differs from the repository, the strict RLS gate expects most tables
in `app` while the restored source stores them in `public`, and three older
trigger functions reference absent `app` relations. The fact, student portal,
and ACE actor triggers were corrected and verified on the target after PRs
#384–#386 merged.
Resolve and test these issues, review environment-specific settings and
secrets, then follow the separate staging and cutover gate. No production
deployment or configuration switch is claimed.

Local step 1.1 verification: migration URL tests 7/7; database deploy workflow
tests 6/6; lint and typecheck 16/16 packages each; Prettier and
`git diff --check` passed. `graphify update .` rebuilt the code graph. The
database connection, migration status and production smoke journeys remain
unverified while Supabase is unavailable. No app build was run because this
step changes the release workflow and CLI scripts, not app code.

Step 1.2a introduces the grant record, validity and revocation fields, and
organisation or site scoped RLS. It does not enable any tag or change effective
permissions. The catalogue, delegation checks, APIs and custom-role migration
remain for later delivery steps. Its migration is committed for later staging
and production application; no live Supabase migration is being attempted now.

Step 1.2b records the product-owner decision to retire customer-created roles
across all sectors. Its typed catalogue matches all 17 Oasis tag names. Five
currently map to delegable NexSteps permissions; twelve remain unavailable
until their missing permission, module, or record-scope rules are delivered.
The catalogue alone does not grant access. Grant/revoke and effective-access
APIs merged in step 1.2c but have not been deployed.

Step 1.2c local verification: API unit tests 994/994, API integration tests
357/357 against disposable Postgres, repository lint and typecheck 16/16 each,
API build, strict local RLS gate, new-file Prettier check, `git diff --check`,
and `graphify update .` passed. The RLS gate used the repository's documented
public-table exposure acceptance; the three pre-existing tables it reports
remain a separate production concern. Live Supabase migration and production
smoke tests remain deferred under the product owner's instruction.

Step 1.2d1 removes customer-facing role creation, editing, cloning,
permission replacement, and retirement from the shared admin application.
The corresponding API routes return a request-correlated `410` after the
existing authentication and permission guards. Historical role definitions
and assignments remain readable. Assigning only fixed roles, auditing parity
and retiring legacy assignments belong to steps 1.2d2 and 1.2d3. The
database's dedicated system-role seed identity remains mandatory in
production. Disposable integration fixtures may temporarily disable the
template trigger in a transaction and restore it before the fixture is used.
Local verification: repository lint and typecheck 16/16 each; API unit
tests, admin tests, API and admin builds, and 20 focused API integration
tests passed. The admin build used a non-secret mock API mode and test Clerk
publishable key. The full local integration suite had 43 passing and 11
failing suites because the disposable test database login has superuser/RLS
bypass privileges and retained conflicting fixtures; current-revision CI
must provide the clean full-suite result. `graphify update .`, targeted
Prettier checks, and `git diff --check` passed. CI then passed all five jobs
on the final PR revision and the host confirmed the merge.

Step 1.2d2 makes the assignment service select only active, platform-owned
fixed roles for new grants. The shared admin assignment picker shows only
those roles. Historical custom assignments remain visible and revocable so
step 1.2d3b can compare and retire them without widening user access.
Local lint and typecheck passed 16/16 packages, API unit tests passed
130/130 suites (998 tests), admin tests passed, and API/admin builds passed.
The two affected database integration suites passed 12/12 tests after a
disposable local database reset. The full local integration run passed 54/54
suites (359/359 tests) when configured with the dedicated RLS roles used by
CI. `graphify update .`, targeted Prettier checks, and `git diff --check`
passed. All five CI jobs then passed on the final PR revision, and GitHub
confirmed the merge.

Step 1.2d3a inventories currently valid custom-role assignments for one
organisation through read-only, organisation-scoped pages. It reports raw
permission keys and conservative fixed-role/tag candidates without issuing
or revoking grants. Live source data and audited retirement remain for step
1.2d3b2 when the database is available.
Local verification: repository lint and typecheck passed 16/16 packages;
API unit tests passed 131/131 suites (1001 tests); the API build and targeted
formatting passed. A populated disposable Postgres smoke run reported a
custom assignment and candidate tag, then the fixture was removed and its
absence verified. The script also rejects an invalid organisation ID before
opening a database connection. No production inventory was run.

Step 1.2d3b1 previews an explicit proposed mapping for every active custom
assignment. It rejects candidates from the wrong scope or site, reports
uncovered legacy keys, and compares current effective permission keys with a
projected result for each affected user at organisation scope and every site.
It performs no grants or revocations. A disposable PostgreSQL 17 instance with
all 93 migrations applied produced a matching three-context report for a site
tag replacement and a nonmatching report for an empty mapping; the synthetic
records were removed. A separate read-only-login smoke run confirmed that a
future-dated custom assignment blocks the preview. Production parity remains
unverified while the source Supabase project is unavailable.

Step 1.2d3b2a adds a transaction-aware effective-access read for the audited
retirement command. It must use the caller's write transaction and bypass the
shared assignment cache so before-and-after comparisons see uncommitted
changes.
Local verification: repository lint and typecheck passed 16/16 packages each;
API unit tests passed 133/133 suites (1007 tests); API integration tests
passed 54/54 suites (361 tests) against a disposable PostgreSQL 17 database
configured to UTC. The focused RLS suite passed 7/7 tests. API build,
targeted Prettier, `git diff --check`, and `graphify update .` passed. Live
Supabase migration and production smoke tests remain deferred.

Step 1.2d3b2b validates the mapping and actor, issues replacements, revokes each
custom assignment with audit and outbox records, and rejects any effective-access
difference before committing. The maintenance command requires a database
identity with RLS bypass because the current tenant and role-definition policies
hide other sites from an ordinary RLS identity. It rejects a partial inventory
rather than treating it as a successful cutover.
Local verification: repository lint and typecheck passed 16/16 packages each;
API unit tests passed 133/133 suites (1007 tests); API integration tests passed
55/55 suites (364 tests) against a disposable PostgreSQL 17 database with all
93 migrations and CI's RLS roles; API build, targeted formatting, and diff
checks passed. The focused suite also verifies that a restricted database
identity cannot run the inventory. Live Supabase migration, inventory, and
production smoke tests remain deferred.

Step 1.3a records the implemented Oasis web journeys, corresponding NexSteps
surfaces, unresolved outcomes, and acceptance checks in
`02-oasis-web-journey-parity.md`. It makes physical PACE ordering the first
core implementation slice and keeps its stock tracking outside paid add-ons.

Step 1.3b1 adds physical PACE order and supply tables, ACE-core inventory
permissions for fixed Organisation Head and Site Lead roles, and catalogue
PACE-number normalization. It does not expose an API or web journey. Local
verification applied all 94 migrations from scratch on disposable PostgreSQL
17 and passed tenant/actor/constraint smoke checks; Prisma reported no drift
for the new tables. The permission registry synchronized and checked with zero
drift. Repository lint and typecheck passed 16/16 packages each; ACE domain,
platform, and auth tests, API/auth builds, targeted formatting, diff review,
and Graphify refresh passed. Production migration remains deferred until the
source Supabase project is available or a verified new-project migration is
ready.

Step 1.3b2a adds read-only, site-scoped physical PACE order and stock pages.
Both routes use the typed ACE inventory read permission and bounded,
filter-scoped cursors. Stock uses active enrolments and supplied rows, with
explicit zero-stock state and pending-order suppression for one/two-PACE
attention. The order and stock command API and admin journey remain in later
steps. Local verification: all 94 migrations applied on disposable PostgreSQL
17; the affected request/RLS suite passed 8/8 with a no-bypass database role;
the API unit suite passed 134/134 (1,012 tests); repository lint and typecheck
passed 16/16 packages each; and the API build passed. Production migration and
live source-data checks remain deferred under the product owner's instruction.

Step 1.3b2c4 adds a manager-only, confirmed forward transition control to ACE
PACE order history. The existing API remains responsible for site, placement,
and status validation. Local verification passed the full admin test suite,
repository lint and typecheck (16/16 packages each), direct ESLint for changed
web files, the admin production build, targeted formatting, diff checks, and
Graphify code graph refresh. Live Supabase migration and production smoke tests
remain deferred under the product owner's instruction.

## Release gate

### DB-2i production cutover — 7 October 2026

The Vercel connection updated `nexsteps-api` production `DATABASE_URL` to the
new project's transaction pooler, `SUPABASE_URL` to
`jzofykdzpuslpdyfovxp`, and `SUPABASE_SECRET_KEY` to its service key. Vercel
read-back through the connected Vercel project environment API confirmed both
production URLs reference `jzofykdzpuslpdyfovxp`. The secret key is present;
its value is not reproduced here. The admin and web Vercel
projects have no database or Supabase environment variables. The GitHub
**production environment** secrets `DIRECT_URL` (session pooler),
`DATABASE_URL` (worker session pooler), `SUPABASE_URL`, and
`SUPABASE_SECRET_KEY` were also updated and their timestamps checked. The
repository-level older secrets were left untouched; production workflows use
the environment-scoped values.

The [manual deployment run](https://github.com/FSS-Ltd/pathway/actions/runs/37645052412)
used `master` commit `a41e09aac3fde40f646e0242b0b8e3f0191e0122`.
Migration job 112873548825, API job 112873938667, admin job 112873938894,
and web job 112873938543 all succeeded. Vercel reports all three production
deployments READY on that commit, with `app.nexsteps.dev` assigned to the
admin deployment. The live API `/health` returned 200 with a database time;
`/health/env` reported the database and Supabase settings present; and
`/public/blog/posts?limit=1` returned one restored post and a next cursor.
The marketing site and `/configure` returned 200. Vercel's authenticated
fetch of `app.nexsteps.dev` returned the expected 307 Clerk sign-in redirect.
Unauthenticated command-line access to that domain hits a Cloudflare challenge
instead. Vercel reported no runtime errors for the API, admin, or web project
in the cutover window checked from 15:33 UTC.

The authenticated admin journey, billing callbacks, background workers, and a
full staging journey suite have not been verified after cutover. The existing
GitHub post-deploy smoke workflow was not dispatched because its unauthenticated
admin `curl` would fail at Cloudflare. The old source remains inactive and
untouched; the accepted post-snapshot write gap and three migration-history
exceptions remain. Monitor production and reconcile any discovered missing
records through audited corrections; do not silently overwrite new writes by
restoring the old snapshot.
