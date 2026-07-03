# SMS Frontend — React SPA

## Stack
- React 18 + React Router v6
- Axios (all calls centralised in src/api/)
- React Query (server state)
- Zustand (client state)

## Layer responsibilities
| Layer | Folder | Rule |
|---|---|---|
| API calls | src/api/ | Only place that knows the backend URL |
| Auth | src/auth/ | JWT storage, AuthContext, PrivateRoute |
| Layout | src/layouts/ | Role-based sidebar — add role by editing NAV_ITEMS |
| Pages | src/pages/{role}/ | One folder per role |
| Hooks | src/hooks/ | React Query wrappers |
| Constants | src/constants/ | Permission strings — never magic strings in components |

## Setup
```bash
cp .env.example .env   # set REACT_APP_API_URL
npm install && npm start
```

## To swap React → Vue / Next.js
Rewrite src/ only. The api/ contract stays identical — same endpoints, same data shapes.

## To add a new role
1. Add the role nav to RoleLayout.jsx NAV_ITEMS
2. Create src/pages/{newrole}/ folder with Dashboard.jsx
3. Add permission constants to src/constants/permissions.js
