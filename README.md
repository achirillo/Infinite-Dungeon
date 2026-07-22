# Infinite Dungeon
An online, procedurally generated choose-your-own-adventure game.

## Frontend
Use HTML/Javascript primarily.  This will be a website that needs to access a shared database.

## Core concept
A CYOA game where every descision you make creates an LLM-Generated "Scene" that then creates more options for the user to choose, similar to a CYOA or text adventure.  Each generated scene is saved to a shared database, creating an endlessly branching tree as more people play.

## Style
The webpage should have a very minimalist style, evoking 90's text adventure games and Command Line Interfaces.  Minimize fancy CSS effects.

## Homepage
This is the first page the user will see, including a logo, a brief description, a button that sends you to the game, and settings.

## Main page
This is the page the game will take place in.  When first arriving, the user will see the intro scene to the CYOA, which is also the root node of the dialogue tree, and progression options as buttons.  Clicking one of these buttons will advance the tree to the response in the corresponding node.  If the scene for the option does not exist yet, it will have an LLM generate the scene and next options.

## Scene generation
The page will be connected to an OpenAI-compatible API running an LLM.  Information about this system including model, prompts, and ESPECIALLY THE API KEY, shoud NOT be accessible by the user.
When generating a scene, the model will recieve all previous scenes and user decisions as context, as well as a custom prompt guiding it on how to write.
After a scene is generated, the model will then check the individual scene generated along a set of guidelines ensuring that the formatting is correct. The scene should only show to the user and be saved if the model generates "YES" when asked if the response follows the guidelines.
All prompts should be stored as separate files.
