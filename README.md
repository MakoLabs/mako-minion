# Mako Minion

Mako is a lightweight, git push oriented, PaaS. It's heavily inspired by [Cavalryl](https://github.com/davidbanham/cavalry).

Minion phones home to masters in the Mako PaaS network topology [Mako Master](https://github.com/MakoLabs/mako-master)

# Installation

Minion expects nginx to be present on the system.
Ports:
- 3000 will need to be accessible by the master.
- 7005 is where nginx is listening
- 8000-9000 Web accessible services, if they ask, will be assigned ports between 8000 and 9000.

It's in npm, so just:
    npm install -g mako-minion

# Running it

Configuration paramaters are passed in via environment variables. eg:

    MINION_ID=us-1 MASTER_HOST=localhost MASTER_PASS=masterpassword MINION_PASS=password node index.js

If they're not present, a default will be substituted.
- MINION_ID is the identifier for the machine
- MASTER_HOST is the fqdn/ip where the master can be found
- MASTER_PASS is the password used to authenticate with the master
- MINION_PASS is the password the master will use to authenticate with this minion
