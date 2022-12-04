# About
**LynxChan** is a chan engine designed with the following goals in mind:
1. Fully support users not using javascript.
2. Make every information available in json format.
3. Support the most amount of users with the least hardware power.
4. Having a modular front-end so people can easily create and use different templates.

#BTC donations:
I accept btc donations: bc1qtqgzhte2ex783lwvyxh4x2zwxsuwf3uplycspy

# Stable versions
See other branches named like `1.1.x` for stable versions. They will receive only critical bug fixes and will be maintained for at least one year after release. Remember to use a compatible version of your front-end with these stable versions. Newer versions might not have required elements on the templates for these versions.

# Required dependencies
* [Node.js](http://nodejs.org) 18.x, I suggest installing from source code. DO NOT build the master's HEAD.
* [MongoDB](https://www.mongodb.org/) 6.0.x.
* [UnZip](http://www.info-zip.org) 6.00, this is probably already included in your distro, though.
* [cUrl](http://curl.haxx.se) 7.29.0, this is usually included too.
* [ImageMagick](http://www.imagemagick.org/script/index.php) 6.9.10-64
* [A front-end](https://gitgud.io/LynxChan/PenumbraLynx) that must either be placed on the `src/fe` directory or have it's absolute path set on the general.json file. Read the readme.md on src/be for more information about how to configure the path for the front-end.
* [Sendmail](https://www.proofpoint.com/us/open-source-email-solution) 8.14.7 used to send e-mails.

# Optional dependencies
* [ffmpeg](https://www.ffmpeg.org/) 4.2 if mediaThumb setting is enabled. Requires zlib-devel on Rocky Linux to work properly when compiled from source.
* [file](http://www.darwinsys.com/file/) 5.11 if the option to validate upload mimetypes is enabled.
* [exiftool](https://www.sno.phy.queensu.ca/~phil/exiftool/) 11.01 if the option to strip exif data is enabled.

# Optional but recommended dependencies
* [Magick++ with headers](https://imagemagick.org/Magick++/) ImageMagick-c++-devel 6.9.10.64 to be more precise.
* [GNU Make](https://www.gnu.org/software/make/) 1:4.2.1-9.
* [Python](https://www.python.org/) 2.7.15-24.
* [GCC C++](https://gcc.gnu.org/) 8.2.1-3.5.

If you need help installing these, consult doc/Dependencies.txt.

The dependencies versions are not exactly mandatory and only reflect the version that I am sure that will work with the current version of the engine at the moment.

# Automatic install (Recommended)
1. Required: browse to `aux` and run the script `setup.sh` that will prompt for the install of a front-end, default settings and libraries. Browsing to the `aux` directory is required because the scripts use relative paths to this directory. Make sure you used `git clone` to obtain the engine.
2. Optional: run the script `root-setup.sh` that will prompt for the install of a command using a soft-link to `src/be/boot.js`. This script must be run as root. It will also prompt for the install of a init script. The name of both the command and the service will be `lynxchan`.
  
# Manual install
1. Create the required settings file in the `src/be/settings` directory. Instructions can be found at `src/be/readme.md`. There is also a directory called settings.example with a set of functional settings.
2. Browse to `src/be` and run `npm install`.
3. Clone a front-end to the `src/fe` directory or clone to anywhere and set it's correct location on `src/be/settings/general.json`.
4. (Optional) clone https://gitgud.io/LynxChan/LynxChan-LocationDownloader to src/be/locationData and compile the data so location flags can work.

# Important details
* Do not use root on any process of the engine install, except when running root-setup.sh.
* If you didn't use git clone to get this repository, the setup script won't be able to change to the latest stable version, since it requires moving to a different branch.
* Pages that are generated, like board and thread pages, won't reflect template changes immediatly. Consult src/be's readme to learn how to manually reload these pages. And even then, keep in mind the server will cache templates when not running on debug mode, so even if you reload the page, a running server might use outdated versions of templates when regenerating pages.
* There is no default admin account. Consult the src/be readme to see how to use the terminal to create a root account or convert an existing one to root.
* If you start the engine on the master branch and then checkout a stable version that is too old, the database might not work or even get corrupted. So if you started it on the master branch and you wish to use a stable version, drop the database if anything weird happens.
* If you wish to allow svgs but the IM policy is keeping you from doing so, you can re-enable them by creating a [policy file](https://imagemagick.org/script/security-policy.php) on src/be/customImConfig. By default the policy is strict due to security concerns, but Rocky 8 is not vulnerable to it and you can allow these files without any concerns.

# Running
You can either run the `lynxchan` command or start the `lynxchan` service if you ran the `aux/root-setup.sh` script. You could just run the `src/be/boot.js` file. Run ``` sudo setcap 'cap_net_bind_service=+ep' `which node` ``` to be able to run it on port 80 without root access.
If you are getting a code 203, it might be selinux not liking where you put lynxchan. Just run ``` chcon -t bin_t ABSOLUTE_PATH_TO_SRC_BE_BOOT.JS ``` to give FHS the finger and it will stop being a busybody.

# Reverse proxies/CDN's (Cloudflare, Vanwa etc)
These services have a history of not caching correctly when the `expires` header is used. So turn on the global setting that makes LynxChan use the `cache-control` header instead. Also, keep in mind the xff header has to be used in conjunction to the trusted proxies feature for the user actual ip to be used instead of the reverse proxy one.

# Documentation
As in many things, I am very anal about documentation.
You can find all the information you need at the documents in `doc`.

# Front-end
The front end are static files and templates. They are handled as a separate project and you can use them on any location in the system. But the path to its files will default to `src/fe`.
Note that the front-end directory is in the ignore. I am designing this project to have a modular front-end, so theres no point in having a default front-end in the repository. 
* [Placeholder front-end](https://gitgud.io/LynxChan/LynxChanFront-Placeholder) is usually more up to date, but has less features and is kind of rough.
* [Third party front-ends](https://gitgud.io/LynxChan/LynxChan-ThirdPartyFrontEnds) listing of third-party front-end repositories. These are meant to be more polished, but not be as updated as the placeholder.

# Back-end
The back-end project is a [Nodeclipse](http://www.nodeclipse.org/) project with lint and formatting defined. IMO eclipse is a shit, but it makes it very practical to automatically format and clean everything.
Coding standard: [Felix's Node style guide](https://github.com/felixge/node-style-guide). Additionally, all files that reach 1k LOC must be split into multiple files inside a module representing the original file.
More information can be found at [src/be/Readme.md](src/be/Readme.md).

# Supported systems
GNU/Linux

# Aux
There a couple of utility scripts there besides the install one. Rotating logs for the upstart service, removing installs and such.

# License
MIT. Do whatever you want, I don't even know what is written there. I just know you can't sue me.

# Development priority
Infra-structure > features > cosmetic features > polish.

# Contributing
I would rather not having other people writing the initial code for the engine, but if you wish to suggest and discuss features or contribute to a default front-end to replace the placeholder ones I am using, you can find me under the name StephenLynx on #lynxchan at Rizon or e-mail me at sergio.a.vianna@gmail.com.

# Uncredited contributors
Lleaff: early front-end contributions and feedback.
Endchan's staff: early adopters and feedback.
Megamilk: feedback and testing from 1.8 to 2.1.
lt_barclay: mobile support for PenumbraLynx.
Tjark: fucking legend.

[WHAT IS THE INTERNET? WHAT IS A CHAN?](https://en.wikipedia.org/wiki/Imageboard)
