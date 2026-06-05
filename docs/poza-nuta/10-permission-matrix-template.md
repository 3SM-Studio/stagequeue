# Poza Nutą — Permission Matrix Template

| Actor | Resource | Action | Allowed? | Condition | Test required |
|---|---|---|---|---|---|
| anonymous | public event | view queue | yes | event active + publicQueueEnabled | yes |
| anonymous | private event | view queue | no | return 404 | yes |
| venue operator | own venue event | manage queue | yes | assigned/authorized | yes |
| venue operator | other venue event | manage queue | no | forbidden/hidden | yes |
| organization owner | organization venue | create event | yes | org owns/operates venue | yes |
| platform owner | any venue | create/manage | yes | platform role | yes |

Every row that can damage data or privacy needs a test.
